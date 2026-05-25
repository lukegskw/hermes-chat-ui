import React, { useState, useEffect, useRef } from 'react';
import Sidebar, { Conversation, Settings } from './components/Sidebar';
import ChatWindow, { ChatWindowMessage } from './components/ChatWindow';
import { fetchModels, sendChatMessageStream, Model } from './utils/api';

interface AppConfig {
  HERMES_API_URL?: string;
  HERMES_API_KEY?: string;
  HERMES_PROXY_PORT?: string;
}

declare global {
  interface Window {
    APP_CONFIG?: AppConfig;
  }
}

// These come exclusively from Portainer ENV vars (via entrypoint.sh → window.APP_CONFIG)
const HERMES_ENDPOINT = window.APP_CONFIG?.HERMES_API_URL || 'http://localhost:8642';
const HERMES_API_KEY = window.APP_CONFIG?.HERMES_API_KEY || '';
const HERMES_PROXY_PORT = window.APP_CONFIG?.HERMES_PROXY_PORT || '8643';

const DEFAULT_SETTINGS: Settings = {
  systemPrompt: 'Você é o Hermes, um assistente autônomo de inteligência artificial poderoso e prestativo. Responda em Português do Brasil.',
};

export default function App() {
  // --- States ---
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('hermes_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem('hermes_conversations');
    return saved ? JSON.parse(saved) : [];
  });

  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    const saved = localStorage.getItem('hermes_active_conv_id');
    return saved || '';
  });

  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const saved = localStorage.getItem('hermes_selected_model');
    return saved || '';
  });
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // --- Refs ---
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Persistence Side Effects ---
  useEffect(() => {
    localStorage.setItem('hermes_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('hermes_conversations', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem('hermes_active_conv_id', activeConversationId);
    } else {
      localStorage.removeItem('hermes_active_conv_id');
    }
  }, [activeConversationId]);

  useEffect(() => {
    localStorage.setItem('hermes_selected_model', selectedModel);
  }, [selectedModel]);

  // --- Connection & Models Fetching ---
  const checkConnectionAndFetchModels = async () => {
    try {
      const fetched = await fetchModels(HERMES_ENDPOINT, HERMES_API_KEY, HERMES_PROXY_PORT);
      setModels(fetched);
      setIsConnected(true);
      
      // If current selected model isn't in the fetched list, select the first one
      if (fetched.length > 0) {
        const found = fetched.find(m => m.id === selectedModel);
        if (!found) {
          setSelectedModel(fetched[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to connect to Hermes API server:', err);
      setIsConnected(false);
      setModels([]);
    }
  };

  useEffect(() => {
    checkConnectionAndFetchModels();
    
    // Periodically poll connection status every 15 seconds
    const interval = setInterval(checkConnectionAndFetchModels, 15000);
    return () => clearInterval(interval);
  }, []);

  // --- Helper: Get active conversation ---
  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const activeMessages = activeConversation ? activeConversation.messages : [];

  // --- User Actions ---
  const handleNewChat = () => {
    const newId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newConv: Conversation = {
      id: newId,
      title: 'Nova Conversa',
      messages: [],
    };
    
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newId);
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConversationId === id) {
      // Find another active conversation if available
      const remaining = conversations.filter(c => c.id !== id);
      if (remaining.length > 0) {
        setActiveConversationId(remaining[0].id);
      } else {
        setActiveConversationId('');
      }
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Tem certeza de que deseja apagar permanentemente todas as conversas?')) {
      setConversations([]);
      setActiveConversationId('');
    }
  };

  const handleSaveSettings = (newSettings: Settings) => {
    setSettings(newSettings);
  };

  const handleSelectModel = async (modelId: string) => {
    if (!modelId) return;
    try {
      setSelectedModel(modelId);
      
      // Update existing conversation if one is active
      if (activeConversationId) {
        setConversations(prev => prev.map(c => 
          c.id === activeConversationId ? { ...c, modelId } : c
        ));
      }
    } catch (err) {
      console.error('Failed to change active model:', err);
      // Fallback
    }
  };

  // --- Streaming Chat Response Handling ---
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isGenerating) return;

    let convId = activeConversationId;
    let currentConversations = [...conversations];

    // 1. Create a conversation if none exists
    if (!convId || !activeConversation) {
      convId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newConv: Conversation = {
        id: convId,
        title: text.substring(0, 30) + (text.length > 30 ? '...' : ''),
        messages: [],
      };
      currentConversations = [newConv, ...currentConversations];
      setConversations(currentConversations);
      setActiveConversationId(convId);
    }

    // 2. Add user message
    const userMsg: ChatWindowMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
    };

    // Update state to render User message instantly
    const targetConv = currentConversations.find(c => c.id === convId);
    const existingMessages = targetConv ? targetConv.messages : [];
    const updatedMessages = [...existingMessages, userMsg];
    
    // Auto title update if it's the first message
    let title = targetConv ? targetConv.title : 'Nova Conversa';
    if (title === 'Nova Conversa') {
      title = text.substring(0, 30) + (text.length > 30 ? '...' : '');
    }

    setConversations(prev => prev.map(c => {
      if (c.id === convId) {
        return { ...c, title, messages: updatedMessages };
      }
      return c;
    }));

    // 3. Prepare empty assistant message for streaming
    const assistantMsgId = `msg_${Date.now() + 1}`;
    const assistantMsg: ChatWindowMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      isGenerating: true,
    };

    setConversations(prev => prev.map(c => {
      if (c.id === convId) {
        return { ...c, messages: [...updatedMessages, assistantMsg] };
      }
      return c;
    }));

    // 4. Fire API call with abort controller
    setIsGenerating(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const actualModel = targetConv?.modelId || selectedModel;

    await sendChatMessageStream({
      endpoint: HERMES_ENDPOINT,
      apiKey: HERMES_API_KEY,
      model: actualModel,
      messages: updatedMessages,
      systemPrompt: settings.systemPrompt || '',
      signal: controller.signal,
      onChunk: (chunk) => {
        setConversations(prev => prev.map(c => {
          if (c.id === convId) {
            return {
              ...c,
              messages: c.messages.map(m => {
                if (m.id === assistantMsgId) {
                  return { ...m, content: m.content + chunk };
                }
                return m;
              })
            };
          }
          return c;
        }));
      },
      onReasoningChunk: (chunk) => {
        setConversations(prev => prev.map(c => {
          if (c.id === convId) {
            return {
              ...c,
              messages: c.messages.map(m => {
                if (m.id === assistantMsgId) {
                  return { ...m, reasoning_content: (m.reasoning_content || '') + chunk };
                }
                return m;
              })
            };
          }
          return c;
        }));
      },
      onToolCallChunk: (tcDelta) => {
        setConversations(prev => prev.map(c => {
          if (c.id === convId) {
            return {
              ...c,
              messages: c.messages.map(m => {
                if (m.id === assistantMsgId) {
                  const currentTools = [...(m.tool_calls || [])];
                  const index = tcDelta.index || 0;
                  if (!currentTools[index]) {
                    currentTools[index] = { id: tcDelta.id, type: tcDelta.type, function: { name: tcDelta.function?.name || '', arguments: tcDelta.function?.arguments || '' } };
                  } else {
                    if (tcDelta.function?.arguments) {
                      currentTools[index].function.arguments += tcDelta.function.arguments;
                    }
                  }
                  return { ...m, tool_calls: currentTools };
                }
                return m;
              })
            };
          }
          return c;
        }));
      },
      onDone: () => {
        setConversations(prev => prev.map(c => {
          if (c.id === convId) {
            return { ...c, messages: c.messages.map(m => m.id === assistantMsgId ? { ...m, isGenerating: false } : m) };
          }
          return c;
        }));
        setIsGenerating(false);
        abortControllerRef.current = null;
      },
      onError: (err) => {
        console.error('Streaming connection error:', err);
        setConversations(prev => prev.map(c => {
          if (c.id === convId) {
            return {
              ...c,
              messages: c.messages.map(m => {
                if (m.id === assistantMsgId) {
                  return {
                    ...m,
                    isGenerating: false,
                    content: m.content + `\n\n❌ **Erro de conexão**: ${err.message}. Certifique-se de que o container do Hermes está ativo e acessível na porta configurada.`
                  };
                }
                return m;
              })
            };
          }
          return c;
        }));
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    });
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      // Mark isGenerating=false on the last assistant message
      setConversations(prev => prev.map(c => ({
        ...c,
        messages: c.messages.map(m => m.isGenerating ? { ...m, isGenerating: false } : m)
      })));
      setIsGenerating(false);
    }
  };

  const handleConversationModelChange = (modelId: string) => {
    if (!activeConversationId) return;
    setConversations(prev => prev.map(c => 
      c.id === activeConversationId ? { ...c, modelId } : c
    ));
  };

  // Block UI completely if API key is not configured via Portainer
  if (!HERMES_API_KEY) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'hsl(var(--bg-deep))',
        color: 'white',
        fontFamily: 'var(--font-sans)',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <div style={{
          maxWidth: '500px',
          padding: '2rem',
          backgroundColor: 'hsl(var(--bg-card))',
          borderRadius: 'var(--border-radius-lg)',
          border: '1px solid hsl(0 80% 60% / 0.5)',
          boxShadow: '0 0 20px hsl(0 80% 60% / 0.2)'
        }}>
          <h2 style={{ color: 'hsl(0 80% 60%)', marginBottom: '1rem' }}>Acesso Bloqueado</h2>
          <p style={{ color: 'hsl(var(--text-secondary))', lineHeight: 1.6, fontSize: '0.95rem' }}>
            A interface Hermes UI foi configurada para exigir uma chave de API para funcionar.
            <br/><br/>
            Por favor, defina a variável de ambiente <strong>HERMES_API_KEY</strong> no seu container do Portainer ou <code>docker-compose.yml</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id="root">
      {/* Drawer overlay for mobile iPhones */}
      {isSidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)} />
      )}
      
      <Sidebar 
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => {
          handleSelectConversation(id);
          setIsSidebarOpen(false); // Close drawer on selection on mobile
        }}
        onNewChat={() => {
          handleNewChat();
          setIsSidebarOpen(false); // Close drawer on new chat
        }}
        onDeleteConversation={handleDeleteConversation}
        onClearAll={handleClearAll}
        models={models}
        selectedModel={selectedModel}
        onSelectModel={handleSelectModel}
        isConnected={isConnected}
        settings={settings}
        onSaveSettings={handleSaveSettings}
      />
      <ChatWindow 
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
        messages={activeMessages}
        isGenerating={isGenerating}
        onSendMessage={handleSendMessage}
        onStopGeneration={handleStopGeneration}
        selectedModel={activeConversation?.modelId || selectedModel}
        models={models}
        onSelectModel={handleConversationModelChange}
      />
    </div>
  );
}
