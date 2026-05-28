import React, { useState, forwardRef } from 'react';
import { Bot, Plus, Trash2, Settings as SettingsIcon, MessageSquare, Sparkles, X, Save } from 'lucide-react';
import { Model, ChatMessage } from '../utils/api';
import './Sidebar.css';
import './Settings.css';

export interface Conversation {
  id: string;
  title: string;
  modelId?: string;
  messages: ChatMessage[];
}

export interface Settings {
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
  isFetchingModels?: boolean;
  connectionError?: string;
  settings: Settings;
  onSaveSettings: (settings: Settings) => void;
}

const Sidebar = forwardRef<HTMLElement, SidebarProps>(({
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
  isFetchingModels,
  connectionError,
  settings,
  onSaveSettings,
}, ref) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempSystemPrompt, setTempSystemPrompt] = useState(settings.systemPrompt || '');

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      systemPrompt: tempSystemPrompt,
    });
    setIsSettingsOpen(false);
  };

  return (
    <aside ref={ref} className={`glass ${isSidebarOpen ? 'sidebar-open' : ''}`} style={{
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
                backgroundColor: isFetchingModels ? 'hsl(35, 90%, 55%)' : isConnected ? 'hsl(var(--accent-emerald))' : 'hsl(0, 80%, 50%)',
                boxShadow: isFetchingModels ? '0 0 8px hsl(35, 90%, 55%)' : isConnected ? '0 0 8px hsl(var(--accent-emerald))' : '0 0 8px hsl(0, 80%, 50%)',
                animation: 'pulseStatus 2s infinite',
              }} />
              <span style={{
                fontSize: '0.7rem',
                color: isFetchingModels ? 'hsl(35, 90%, 55%)' : isConnected ? 'hsl(var(--text-main) / 0.7)' : 'hsl(var(--text-muted))',
                fontWeight: '500',
              }}>
                {isFetchingModels ? 'Conectando...' : isConnected ? 'Online' : 'Offline'}
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
          position: 'relative',
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
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: isConnected ? 'hsl(var(--text-main))' : 'hsl(var(--text-muted))',
              fontSize: '0.82rem',
              fontWeight: '600',
              outline: 'none',
              cursor: isConnected ? 'pointer' : 'default',
              appearance: 'none',
              paddingRight: '12px',
            }}
            disabled={(!isConnected && !isFetchingModels) || models.length === 0}
          >
            {models.length === 0 && isFetchingModels ? (
              <option value={selectedModel}>{selectedModel || 'Buscando Modelos...'}</option>
            ) : models.length === 0 && connectionError ? (
              <option value="">{connectionError.substring(0, 30)}...</option>
            ) : models.length === 0 && isConnected ? (
              <option value={selectedModel}>{selectedModel || 'Sem Modelos'}</option>
            ) : models.length === 0 && !isConnected ? (
              <option value="">Hermes desconectado</option>
            ) : (
              models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label || m.id}
                </option>
              ))
            )}
          </select>
          {/* Custom dropdown arrow */}
          <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.5 }}>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
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

      {/* Settings Dialog Modal/Drawer */}
      {isSettingsOpen && (
        <div className="settings-overlay">
          <form 
            onSubmit={handleSaveSettings}
            className="glass settings-modal" 
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
                Prompt de Sistema (Opcional)
              </label>
              <textarea 
                className="settings-textarea"
                rows={8}
                value={tempSystemPrompt}
                onChange={(e) => setTempSystemPrompt(e.target.value)}
                placeholder="Você é o Hermes, um assistente de IA prestativo..."
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
});

export default Sidebar;
