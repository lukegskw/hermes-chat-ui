import React, { useState } from 'react';
import { Copy, Check, Bot, User, Sparkles, TerminalSquare, ChevronDown, ChevronRight, BrainCircuit } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { ChatWindowMessage } from './ChatWindow';

export interface MessageBubbleProps {
  message: ChatWindowMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content, timestamp } = message;
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);
  const [showReasoning, setShowReasoning] = useState(true);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = content;
        // Move outside of viewport
        textArea.style.position = "absolute";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (err) {
          console.error('Fallback: Oops, unable to copy', err);
        }
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  return (
    <div 
      className="animate-fade"
      style={{
        display: 'flex',
        gap: '14px',
        width: '100%',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
        marginBottom: '1.25rem',
      }}
    >
      {/* Avatar Container */}
      <div 
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: isUser ? 'none' : '0 0 10px hsl(var(--accent-primary) / 0.25)',
          background: isUser 
            ? 'hsl(var(--bg-card))' 
            : 'linear-gradient(135deg, hsl(var(--accent-primary)), hsl(var(--accent-secondary)))',
          border: isUser ? '1px solid hsl(var(--border-subtle))' : 'none',
        }}
      >
        {isUser ? (
          <User size={16} style={{ color: 'hsl(var(--text-secondary))' }} />
        ) : (
          <Bot size={16} style={{ color: 'white' }} />
        )}
      </div>

      {/* Bubble Content Card */}
      <div 
        className={!isUser ? "glass" : ""}
        style={{
          maxWidth: '75%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          borderRadius: 'var(--border-radius-lg)',
          borderTopRightRadius: isUser ? '4px' : 'var(--border-radius-lg)',
          borderTopLeftRadius: isUser ? 'var(--border-radius-lg)' : '4px',
          backgroundColor: isUser 
            ? 'hsl(var(--accent-primary) / 0.12)' 
            : 'hsl(var(--bg-card) / 0.45)',
          border: '1px solid',
          borderColor: isUser 
            ? 'hsl(var(--accent-primary) / 0.25)' 
            : 'hsl(var(--border-subtle))',
          boxShadow: isUser ? 'none' : '0 4px 15px rgba(0,0,0,0.15)',
          padding: '0.88rem 1.1rem',
        }}
      >
        {/* Role label / Action header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px',
          gap: '20px',
        }}>
          <span style={{
            fontSize: '0.72rem',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: isUser ? 'hsl(var(--accent-primary) / 0.8)' : 'hsl(var(--text-muted))',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            {!isUser && <Sparkles size={10} style={{ color: 'hsl(var(--accent-secondary))' }} />}
            {isUser ? 'Você' : 'Hermes'}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              fontSize: '0.65rem',
              color: 'hsl(var(--text-muted))',
              fontWeight: '500',
            }}>
              {formatTime(timestamp)}
            </span>
            
            <button
              onClick={handleCopy}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'hsl(var(--text-muted))',
                cursor: 'pointer',
                opacity: 0.6,
                transition: 'all 0.15s',
                padding: '2px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Copiar mensagem"
              className="msg-copy-btn"
            >
              {copied ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
            </button>
          </div>
        </div>

        {/* Reasoning and Tools rendering */}
        {!isUser && (message.reasoning_content || (message.tool_calls && message.tool_calls.length > 0)) && (
          <div style={{ marginBottom: '12px' }}>
            {message.reasoning_content && (
              <div 
                style={{
                  backgroundColor: 'hsl(var(--bg-deep) / 0.5)',
                  border: '1px solid hsl(var(--border-subtle))',
                  borderRadius: 'var(--border-radius-md)',
                  marginBottom: '8px',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setShowReasoning(!showReasoning)}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'hsl(var(--text-muted))',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  <BrainCircuit size={14} style={{ color: 'hsl(var(--accent-secondary))' }} />
                  Processo de Raciocínio (Thoughts)
                  <div style={{ marginLeft: 'auto' }}>
                    {showReasoning ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </button>
                {showReasoning && (
                  <div style={{
                    padding: '8px 12px 12px 12px',
                    borderTop: '1px solid hsl(var(--border-subtle))',
                    color: 'hsl(var(--text-secondary))',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-sans)',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    fontStyle: 'italic',
                  }}>
                    {message.reasoning_content}
                  </div>
                )}
              </div>
            )}
            
            {message.tool_calls && message.tool_calls.map((tc: any, i: number) => (
              <div key={i} style={{
                backgroundColor: 'hsl(var(--bg-deep) / 0.8)',
                border: '1px dashed hsl(var(--accent-primary) / 0.5)',
                borderRadius: 'var(--border-radius-sm)',
                padding: '8px 12px',
                marginBottom: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: 'hsl(var(--accent-primary))',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                }}>
                  <TerminalSquare size={14} />
                  🛠️ Executando Ferramenta: {tc.function?.name}
                </div>
                {tc.function?.arguments && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'hsl(var(--text-muted))',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: 'hsl(var(--bg-card))',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
                    {tc.function.arguments}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Inline thinking animation - shown while waiting for first content token */}
        {!isUser && message.isGenerating && !message.content && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '4px 0 8px 0',
          }}>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'hsl(var(--accent-primary))', animation: 'typingDot 1.2s infinite 0s' }} />
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'hsl(var(--accent-primary))', animation: 'typingDot 1.2s infinite 0.25s' }} />
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'hsl(var(--accent-primary))', animation: 'typingDot 1.2s infinite 0.5s' }} />
            </div>
            <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', fontWeight: '500', letterSpacing: '0.2px', fontStyle: 'italic' }}>
              Processando dados neurais...
            </span>
          </div>
        )}

        {/* Message body */}
        <div style={{
          fontSize: '0.94rem',
          color: isUser ? 'hsl(var(--text-pure))' : 'hsl(var(--text-main))',
          wordBreak: 'break-word',
        }}>
          {isUser ? (
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{content}</p>
          ) : (
            <MarkdownRenderer content={content} />
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .msg-copy-btn:hover {
          opacity: 1 !important;
          color: hsl(var(--text-pure)) !important;
          background-color: hsl(var(--bg-surface) / 0.8) !important;
        }
      `}} />
    </div>
  );
}
