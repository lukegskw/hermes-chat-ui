import React, { useState, useRef, useEffect } from 'react';
import { Send, Square, Sparkles, Terminal, ArrowRight, ShieldCheck, HelpCircle, Menu } from 'lucide-react';
import MessageBubble from './MessageBubble';

const SUGGESTIONS = [
  {
    title: "💡 Listar Automóveis/Luzes",
    desc: "Pergunte ao Hermes sobre dispositivos no Home Assistant.",
    prompt: "Liste todas as automações de luzes configuradas no meu Home Assistant."
  },
  {
    title: "⚡ Rodar Diagnóstico",
    desc: "Verifique a integridade do sistema do sandbox local.",
    prompt: "Execute um diagnóstico do sistema local e relate quaisquer problemas ou status de containers."
  },
  {
    title: "🧠 Ajuda em Programação",
    desc: "Crie ou analise trechos de código em Python/JS.",
    prompt: "Escreva uma função em Python para calcular a diferença de tempo entre dois timestamps do banco de dados SQLite."
  },
  {
    title: "⚙️ Customizar Skills",
    desc: "Entenda como gerenciar ferramentas no Hermes.",
    prompt: "Como posso criar uma nova skill customizada em Python para o Hermes Agent?"
  }
];

export default function ChatWindow({
  onToggleSidebar,
  messages,
  isGenerating,
  onSendMessage,
  onStopGeneration,
  selectedModel,
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Handle textarea height auto-grow
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim() || isGenerating) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <main style={{
      flex: 1,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'hsl(var(--bg-deep))',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Mobile-only Header Bar */}
      <div className="mobile-header-bar" style={{ display: 'none' }}>
        <button
          onClick={onToggleSidebar}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
          }}
          title="Menu"
        >
          <Menu size={22} />
        </button>
        <span style={{ fontSize: '0.94rem', fontWeight: '700', color: 'white', letterSpacing: '-0.2px' }}>
          Hermes Console
        </span>
        <div style={{ width: '22px' }} /> {/* Spacer for symmetry */}
      </div>

      {/* Messages View Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.5rem 2rem',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {messages.length > 0 ? (
          <div style={{ maxWidth: '850px', width: '100%', margin: '0 auto' }}>
            {messages.filter(msg => !(msg.role === 'assistant' && !msg.content)).map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            
            {/* Thinking Indicator Bubble - Premium Neural Activity Breathing Animation */}
            {isGenerating && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && (
              <div 
                className="animate-fade"
                style={{
                  display: 'flex',
                  gap: '14px',
                  width: '100%',
                  alignItems: 'flex-start',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(135deg, hsl(var(--accent-primary)), hsl(var(--accent-secondary)))',
                  boxShadow: '0 0 15px hsl(var(--accent-primary) / 0.35)',
                  animation: 'pulseGlow 2s infinite',
                }}>
                  <Sparkles size={16} color="white" />
                </div>
                <div className="glass neural-breathing" style={{
                  border: '1px solid hsl(var(--border-subtle))',
                  borderRadius: 'var(--border-radius-lg)',
                  borderTopLeftRadius: '4px',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', gap: '5px', padding: '4px 2px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', animation: 'typingDot 1.2s infinite 0s' }} />
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', animation: 'typingDot 1.2s infinite 0.25s' }} />
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', animation: 'typingDot 1.2s infinite 0.5s' }} />
                  </div>
                  <span style={{ fontSize: '0.82rem', color: 'hsl(var(--text-main))', fontWeight: '600', marginLeft: '6px', letterSpacing: '0.2px' }}>
                    Processando dados neurais...
                  </span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        ) : (
          /* High-Fidelity Welcome & Suggestions Dashboard */
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            maxWidth: '800px',
            width: '100%',
            margin: '0 auto',
            textAlign: 'center',
            padding: '2rem 1rem',
          }}>
            {/* Glowing Icon */}
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '24px',
              background: 'linear-gradient(135deg, hsl(var(--accent-primary)), hsl(var(--accent-secondary)))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 35px hsl(var(--accent-primary) / 0.3)',
              marginBottom: '1.5rem',
              animation: 'pulseGlow 4s infinite',
            }}>
              <Sparkles size={36} color="white" />
            </div>

            <h2 style={{
              fontSize: '2rem',
              fontWeight: '800',
              color: 'hsl(var(--text-pure))',
              marginBottom: '0.5rem',
              letterSpacing: '-0.7px',
            }}>
              Olá! Eu sou o Hermes Agent.
            </h2>
            <p style={{
              fontSize: '1rem',
              color: 'hsl(var(--text-secondary))',
              maxWidth: '540px',
              marginBottom: '2.5rem',
              lineHeight: 1.5,
            }}>
              Como assistente autônomo local, posso rodar comandos, integrar-me com sua casa inteligente e realizar buscas avançadas. O que faremos hoje?
            </p>

            {/* Grid of Action Suggestion Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              width: '100%',
              maxWidth: '700px',
            }}>
              {SUGGESTIONS.map((card, idx) => (
                <div 
                  key={idx}
                  onClick={() => onSendMessage(card.prompt)}
                  className="glass glow-hover"
                  style={{
                    padding: '1.1rem',
                    borderRadius: 'var(--border-radius-lg)',
                    backgroundColor: 'hsl(var(--bg-card) / 0.4)',
                    border: '1px solid hsl(var(--border-subtle))',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '4px',
                    transition: 'all 0.2s',
                  }}
                >
                  <h4 style={{
                    fontSize: '0.9rem',
                    fontWeight: '700',
                    color: 'white',
                  }}>{card.title}</h4>
                  <p style={{
                    fontSize: '0.78rem',
                    color: 'hsl(var(--text-secondary))',
                    lineHeight: 1.4,
                  }}>{card.desc}</p>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.72rem',
                    color: 'hsl(var(--accent-primary))',
                    fontWeight: '600',
                    marginTop: '8px',
                  }}>
                    Perguntar ao Hermes
                    <ArrowRight size={11} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input controls Container */}
      <div style={{
        padding: '0 2rem 2rem 2rem',
        maxWidth: '900px',
        width: '100%',
        margin: '0 auto',
      }}>
        <form 
          onSubmit={handleSubmit}
          className="glass glow-hover"
          style={{
            backgroundColor: 'hsl(var(--bg-card) / 0.7)',
            borderRadius: 'var(--border-radius-lg)',
            border: '1px solid hsl(var(--border-subtle))',
            padding: '0.6rem 0.8rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {/* Active Model Indicator inside Input Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.68rem',
            color: 'hsl(var(--text-muted))',
            fontWeight: '600',
            padding: '0 4px',
            borderBottom: '1px solid hsl(var(--border-subtle) / 0.4)',
            paddingBottom: '6px',
          }}>
            <Terminal size={11} style={{ color: 'hsl(var(--accent-primary))' }} />
            EXECUTANDO COM: <span style={{ color: 'hsl(var(--text-secondary))', fontFamily: 'var(--font-mono)' }}>{selectedModel}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Envie uma mensagem para o Hermes..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'white',
                fontSize: '0.94rem',
                lineHeight: '1.5',
                resize: 'none',
                padding: '6px 4px',
                fontFamily: 'var(--font-sans)',
                maxHeight: '180px',
              }}
            />
            
            {/* Input buttons group */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isGenerating ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--border-radius-md)',
                    backgroundColor: 'hsl(0 60% 40% / 0.2)',
                    border: '1px solid hsl(0 60% 40% / 0.4)',
                    color: 'hsl(0 80% 60%)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}
                  title="Interromper geração"
                >
                  <Square size={16} fill="hsl(0 80% 60%)" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--border-radius-md)',
                    backgroundColor: input.trim() ? 'hsl(var(--accent-primary))' : 'hsl(var(--bg-deep))',
                    border: 'none',
                    color: input.trim() ? 'white' : 'hsl(var(--text-muted))',
                    cursor: input.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.25s',
                    boxShadow: input.trim() ? 'var(--shadow-glow)' : 'none',
                  }}
                  title="Enviar mensagem"
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>
        </form>

        {/* Local Sandboxed Status Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          fontSize: '0.7rem',
          color: 'hsl(var(--text-muted))',
          fontWeight: '500',
          marginTop: '8px',
        }}>
          <ShieldCheck size={12} style={{ color: 'hsl(var(--accent-emerald))' }} />
          Conexão Segura e Local: Toda inteligência permanece em seu NAS sandbox.
        </div>
      </div>
    </main>
  );
}
