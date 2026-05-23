import React, { useState } from 'react';
import { 
  Bot, Plus, Trash2, Settings as SettingsIcon, MessageSquare, 
  Database, Wifi, WifiOff, Sparkles, X, Save 
} from 'lucide-react';
import { Model } from '../utils/api';

export interface Conversation {
  id: string;
  title: string;
  messages: any[];
}

export interface Settings {
  endpoint: string;
  apiKey: string;
  systemPrompt?: string;
}

export interface SidebarProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onClearAll: () => void;
  models: Model[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  isConnected: boolean;
  settings: Settings;
  onSaveSettings: (settings: Settings) => void;
}

export default function Sidebar({
  isSidebarOpen,
  onToggleSidebar,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onClearAll,
  models,
  selectedModel,
  onSelectModel,
  isConnected,
  settings,
  onSaveSettings,
}: SidebarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempEndpoint, setTempEndpoint] = useState(settings.endpoint);
  const [tempKey, setTempKey] = useState(settings.apiKey);
  const [tempSystemPrompt, setTempSystemPrompt] = useState(settings.systemPrompt || '');

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      endpoint: tempEndpoint,
      apiKey: tempKey,
      systemPrompt: tempSystemPrompt,
    });
    setIsSettingsOpen(false);
  };

  return (
    <aside className={`glass ${isSidebarOpen ? 'sidebar-open' : ''}`} style={{
      width: 'var(--sidebar-width)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid hsl(var(--border-subtle))',
      backgroundColor: 'hsl(var(--bg-surface) / 0.85)',
      flexShrink: 0,
      position: 'relative',
      zIndex: 10,
    }}>
      {/* Sidebar Header with Notch Support */}
      <div style={{
        paddingLeft: '1.25rem',
        paddingRight: '1.25rem',
        paddingBottom: '1.25rem',
        paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))',
        borderBottom: '1px solid hsl(var(--border-subtle))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, hsl(var(--accent-primary)), hsl(var(--accent-secondary)))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-glow)',
            animation: 'pulseGlow 3s infinite',
          }}>
            <Bot size={20} color="white" />
          </div>
          <div>
            <h1 style={{
              fontSize: '1.05rem',
              fontWeight: '700',
              color: 'hsl(var(--text-pure))',
              letterSpacing: '-0.3px',
              margin: 0,
            }}>Hermes Chat</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
              <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isConnected ? 'hsl(var(--accent-emerald))' : 'hsl(0, 80%, 50%)',
                boxShadow: isConnected ? '0 0 8px hsl(var(--accent-emerald))' : '0 0 8px hsl(0, 80%, 50%)',
                animation: 'pulseStatus 2s infinite',
              }} />
              <span style={{
                fontSize: '0.7rem',
                color: isConnected ? 'hsl(var(--text-main) / 0.7)' : 'hsl(var(--text-muted))',
                fontWeight: '500',
              }}>
                {isConnected ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile-only Close Drawer Button */}
        <button
          onClick={onToggleSidebar}
          className="mobile-close-sidebar-btn"
          style={{
            display: 'none', // Shown only in CSS media queries on mobile
            background: 'transparent',
            border: 'none',
            color: 'hsl(var(--text-muted))',
            cursor: 'pointer',
          }}
          title="Fechar painel"
        >
          <X size={20} />
        </button>
      </div>

      {/* New Chat Button */}
      <div style={{ padding: '1rem 1rem 0.5rem 1rem' }}>
        <button 
          onClick={onNewChat}
          className="glow-hover"
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--border-radius-md)',
            backgroundColor: 'hsl(var(--accent-primary) / 0.12)',
            border: '1px solid hsl(var(--accent-primary) / 0.3)',
            color: 'hsl(var(--text-pure))',
            fontSize: '0.88rem',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          <Plus size={16} />
          Nova Conversa
        </button>
      </div>

      {/* Model Selection */}
      <div style={{ padding: '0.5rem 1rem 0.75rem 1rem' }}>
        <div style={{
          backgroundColor: 'hsl(var(--bg-deep) / 0.6)',
          border: '1px solid hsl(var(--border-subtle))',
          borderRadius: 'var(--border-radius-md)',
          padding: '0.5rem 0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          <label style={{
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'hsl(var(--text-muted))',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <Sparkles size={11} className="text-secondary" />
            Modelo Ativo
          </label>
          <select 
            value={selectedModel}
            onChange={(e) => onSelectModel(e.target.value)}
            disabled={!isConnected}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: isConnected ? 'hsl(var(--text-main))' : 'hsl(var(--text-muted))',
              fontSize: '0.82rem',
              fontWeight: '600',
              outline: 'none',
              cursor: isConnected ? 'pointer' : 'not-allowed',
            }}
          >
            {models.length > 0 ? (
              models.map(m => (
                <option key={m.id} value={m.id} style={{ background: 'hsl(var(--bg-surface))' }}>
                  {m.id}
                </option>
              ))
            ) : (
              <option style={{ background: 'hsl(var(--bg-surface))' }}>
                {isConnected ? 'Buscando modelos...' : 'Hermes desconectado'}
              </option>
            )}
          </select>
        </div>
      </div>

      {/* Conversations List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0.5rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>
        <div style={{
          fontSize: '0.72rem',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'hsl(var(--text-muted))',
          paddingLeft: '6px',
          marginBottom: '2px',
        }}>
          Conversas Recentes
        </div>

        {conversations.length > 0 ? (
          conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <div 
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className="glow-hover"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.7rem 0.8rem',
                  borderRadius: 'var(--border-radius-md)',
                  backgroundColor: isActive ? 'hsl(var(--bg-card))' : 'transparent',
                  border: '1px solid',
                  borderColor: isActive ? 'hsl(var(--border-subtle))' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                  <MessageSquare size={15} style={{
                    color: isActive ? 'hsl(var(--accent-primary))' : 'hsl(var(--text-muted))',
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: '0.85rem',
                    color: isActive ? 'hsl(var(--text-pure))' : 'hsl(var(--text-main) / 0.8)',
                    fontWeight: isActive ? '600' : '400',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {conv.title || 'Conversa sem título'}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'hsl(var(--text-muted))',
                    cursor: 'pointer',
                    opacity: isActive ? 0.7 : 0,
                    transition: 'opacity 0.2s',
                    padding: '2px',
                    borderRadius: '4px',
                  }}
                  className="delete-btn"
                  title="Excluir chat"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        ) : (
          <div style={{
            fontSize: '0.8rem',
            color: 'hsl(var(--text-muted))',
            textAlign: 'center',
            padding: '2rem 1rem',
            fontStyle: 'italic',
          }}>
            Nenhuma conversa iniciada
          </div>
        )}
      </div>

      {/* Sidebar Footer (Settings and Actions) */}
      <div style={{
        padding: '1rem',
        borderTop: '1px solid hsl(var(--border-subtle))',
        backgroundColor: 'hsl(var(--bg-deep) / 0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}>
        {/* Connection detail */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.72rem',
          color: 'hsl(var(--text-secondary) / 0.8)',
          padding: '0 4px',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Database size={12} />
            Hermes Host
          </span>
          <span style={{ 
            fontWeight: '600', 
            fontFamily: 'var(--font-mono)', 
            maxWidth: '120px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {settings.endpoint.replace(/^https?:\/\//, '')}
          </span>
        </div>

        {/* Buttons Row */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="glow-hover"
            style={{
              flex: 1,
              padding: '0.6rem',
              borderRadius: 'var(--border-radius-sm)',
              border: '1px solid hsl(var(--border-subtle))',
              backgroundColor: 'hsl(var(--bg-card))',
              color: 'hsl(var(--text-main))',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <SettingsIcon size={14} />
            Ajustes
          </button>
          
          {conversations.length > 0 && (
            <button
              onClick={onClearAll}
              style={{
                padding: '0.6rem',
                borderRadius: 'var(--border-radius-sm)',
                border: '1px solid hsl(0 60% 40% / 0.3)',
                backgroundColor: 'hsl(0 60% 40% / 0.1)',
                color: 'hsl(0 80% 60%)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
              }}
              title="Limpar todas as conversas"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* CSS injection for delete button hover behavior */}
      <style dangerouslySetInnerHTML={{__html: `
        [style*="Conversa sem título"]:hover .delete-btn,
        div[key]:hover .delete-btn {
          opacity: 1 !important;
        }
        .delete-btn:hover {
          color: hsl(0, 80%, 60%) !important;
          background-color: hsl(0 80% 60% / 0.1) !important;
        }
        @media (max-width: 768px) {
          .mobile-close-sidebar-btn {
            display: block !important;
          }
        }
      `}} />

      {/* Settings Dialog Drawer overlay */}
      {isSettingsOpen && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          top: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          zIndex: 100,
          animation: 'fadeIn 0.2s ease-out',
        }}>
          <form 
            onSubmit={handleSaveSettings}
            className="glass" 
            style={{
              backgroundColor: 'hsl(var(--bg-card))',
              borderTop: '1px solid hsl(var(--border-subtle))',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: 'none',
              padding: '1.25rem',
              borderRadius: 'var(--border-radius-lg) var(--border-radius-lg) 0 0',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <SettingsIcon size={16} className="text-secondary" />
                Configurações da API
              </h3>
              <button 
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: '600', color: 'hsl(var(--text-secondary))' }}>
                API Endpoint URL
              </label>
              <input 
                type="url"
                required
                value={tempEndpoint}
                onChange={(e) => setTempEndpoint(e.target.value)}
                style={{
                  padding: '0.6rem 0.8rem',
                  borderRadius: 'var(--border-radius-sm)',
                  backgroundColor: 'hsl(var(--bg-deep))',
                  border: '1px solid hsl(var(--border-subtle))',
                  color: 'white',
                  fontSize: '0.82rem',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: '600', color: 'hsl(var(--text-secondary))' }}>
                API Key (Bearer)
              </label>
              <input 
                type="password"
                required
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                style={{
                  padding: '0.6rem 0.8rem',
                  borderRadius: 'var(--border-radius-sm)',
                  backgroundColor: 'hsl(var(--bg-deep))',
                  border: '1px solid hsl(var(--border-subtle))',
                  color: 'white',
                  fontSize: '0.82rem',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: '600', color: 'hsl(var(--text-secondary))' }}>
                Prompt de Sistema (Opcional)
              </label>
              <textarea 
                rows={3}
                value={tempSystemPrompt}
                onChange={(e) => setTempSystemPrompt(e.target.value)}
                placeholder="Você é o Hermes, um assistente de IA prestativo..."
                style={{
                  padding: '0.6rem 0.8rem',
                  borderRadius: 'var(--border-radius-sm)',
                  backgroundColor: 'hsl(var(--bg-deep))',
                  border: '1px solid hsl(var(--border-subtle))',
                  color: 'white',
                  fontSize: '0.82rem',
                  outline: 'none',
                  resize: 'none',
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                marginTop: '6px',
                padding: '0.75rem',
                borderRadius: 'var(--border-radius-md)',
                backgroundColor: 'hsl(var(--accent-primary))',
                border: 'none',
                color: 'white',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Save size={15} />
              Salvar Configurações
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
