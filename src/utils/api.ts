/**
 * Hermes OpenAI-Compatible Client API in TypeScript
 */

export interface Model {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface SendChatMessageStreamOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  systemPrompt: string;
  onChunk: (chunk: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

export async function fetchModels(endpoint: string, apiKey: string): Promise<Model[]> {
  const url = `${endpoint.replace(/\/$/, '')}/v1/models`;
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
  return (data.data || []) as Model[];
}

export async function selectModel(endpoint: string, apiKey: string, modelId: string): Promise<any> {
  const url = `${endpoint.replace(/\/$/, '')}/v1/model/select`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: modelId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to select model: ${response.statusText}`);
  }

  return await response.json();
}

export async function sendChatMessageStream({
  endpoint,
  apiKey,
  model,
  messages,
  systemPrompt,
  onChunk,
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
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              onChunk(content);
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
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            onChunk(content);
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
