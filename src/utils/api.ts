/**
 * Hermes OpenAI-Compatible Client API in TypeScript
 */

export interface Model {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning_content?: string;
  tool_calls?: ToolCall[];
}

export interface SendChatMessageStreamOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  systemPrompt: string;
  onChunk: (chunk: string) => void;
  onReasoningChunk?: (chunk: string) => void;
  onToolCallChunk?: (toolCallDelta: any) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

export async function fetchModels(endpoint: string, apiKey: string): Promise<{models: Model[], defaultModel: string}> {
  const base = endpoint.replace(/\\/$/, '');
  const url = `${base}/v1/models?t=${Date.now()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const data = await response.json();
  const all = (data.data || []) as Model[];
  // Filter out the generic proxy alias if real provider models are present
  const real = all.filter(m => m.id !== 'hermes-agent');
  const finalModels = real.length > 0 ? real : all;
  
  return {
    models: finalModels,
    defaultModel: finalModels.length > 0 ? finalModels[0].id : 'hermes-agent'
  };
}

export async function sendChatMessageStream({
  endpoint,
  apiKey,
  model,
  messages,
  systemPrompt,
  onChunk,
  onReasoningChunk,
  onToolCallChunk,
  onDone,
  onError,
  signal
}: SendChatMessageStreamOptions): Promise<void> {
  try {
    const url = `${endpoint.replace(/\/$/, '')}/v1/chat/completions`;
    
    // Prepare conversation messages payload
    const payloadMessages: ChatMessage[] = [];
    if (systemPrompt) {
      payloadMessages.push({ role: 'system', content: systemPrompt });
    }
    
    // Map internal message roles
    messages.forEach(msg => {
      payloadMessages.push({
        role: msg.role,
        content: msg.content
      });
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: payloadMessages,
        stream: true,
      }),
      signal: signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    
    // Map hermes toolCallIds to standard array indices for the UI state
    let currentToolIndex = 0;
    const toolIndexMap = new Map<string, number>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Keep the last incomplete line in the buffer
      const lastLine = lines.pop();
      buffer = lastLine !== undefined ? lastLine : '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('data: ')) {
          const dataContent = trimmed.substring(6).trim();
          if (dataContent === '[DONE]') {
            onDone();
            return;
          }

          try {
            const parsed = JSON.parse(dataContent);
            
            // Handle standard OpenAI format
            const delta = parsed.choices?.[0]?.delta || {};
            if (delta.content) {
              onChunk(delta.content);
            }
            if (delta.reasoning_content && onReasoningChunk) {
              onReasoningChunk(delta.reasoning_content);
            }
            if (delta.tool_calls && onToolCallChunk) {
              for (const tc of delta.tool_calls) {
                onToolCallChunk(tc);
              }
            }

            // Handle Hermes custom tool events
            if (parsed.toolCallId && parsed.tool && parsed.status === 'running' && onToolCallChunk) {
              if (!toolIndexMap.has(parsed.toolCallId)) {
                toolIndexMap.set(parsed.toolCallId, currentToolIndex++);
              }
              const idx = toolIndexMap.get(parsed.toolCallId);
              
              onToolCallChunk({
                index: idx,
                id: parsed.toolCallId,
                type: 'function',
                function: {
                  name: parsed.tool,
                  arguments: parsed.label || '',
                }
              });
            }
          } catch (e) {
            // Ignore syntax errors for non-JSON or other formatting
          }
        }
      }
    }

    // Flush any remaining buffer
    if (buffer && buffer.startsWith('data: ')) {
      const dataContent = buffer.substring(6).trim();
      if (dataContent !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataContent);
          const delta = parsed.choices?.[0]?.delta || {};
          if (delta.content) {
            onChunk(delta.content);
          }
          if (delta.reasoning_content && onReasoningChunk) {
            onReasoningChunk(delta.reasoning_content);
          }
          if (delta.tool_calls && onToolCallChunk) {
            for (const tc of delta.tool_calls) {
              onToolCallChunk(tc);
            }
          }
          
          if (parsed.toolCallId && parsed.tool && parsed.status === 'running' && onToolCallChunk) {
            if (!toolIndexMap.has(parsed.toolCallId)) {
              toolIndexMap.set(parsed.toolCallId, currentToolIndex++);
            }
            const idx = toolIndexMap.get(parsed.toolCallId);
            onToolCallChunk({
              index: idx,
              id: parsed.toolCallId,
              type: 'function',
              function: { name: parsed.tool, arguments: parsed.label || '' }
            });
          }
        } catch (e) {}
      }
    }

    onDone();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      // User aborted stream, do not trigger error callback
      onDone();
    } else {
      onError(error as Error);
    }
  }
}

export interface PendingApproval {
  id: string;
  tool: string;
  command: string;
  label?: string;
  risk_level?: string;
  session_id?: string;
}

/** Poll for pending approvals */
export async function fetchPendingApproval(endpoint: string, apiKey: string): Promise<PendingApproval | null> {
  // Polling disabled as native API server handles approvals conversationally
  return null;
}

/** Submit approval decision */
export async function respondApproval(
  endpoint: string, apiKey: string,
  choice: 'once' | 'session' | 'always' | 'deny',
  sessionId?: string
): Promise<void> {
  const url = `${endpoint.replace(/\/$/, '')}/api/approval/respond`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ choice, session_id: sessionId || 'default' })
  });
}

/** Trigger context compaction via native slash command */
export async function compressSession(endpoint: string, apiKey: string): Promise<boolean> {
  const url = `${endpoint.replace(/\/$/, '')}/v1/chat/completions`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "hermes-agent",
        messages: [{ role: "user", content: "/compress" }],
        stream: false
      })
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to compress session:", err);
    return false;
  }
}
