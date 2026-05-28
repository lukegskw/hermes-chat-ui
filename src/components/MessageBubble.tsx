import { useState } from 'react';
import { Copy, Check, Bot, User, Sparkles, TerminalSquare, ChevronDown, ChevronRight, BrainCircuit } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { ChatWindowMessage } from './ChatWindow';
import { ToolCall } from '../utils/api';
import { logger } from '../utils/logger';
import { AgentActivityLog } from './AgentActivityLog';
import { ToolCallBox } from './ToolCallBox';
import './MessageBubble.css';

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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
          logger.error({ error: err }, 'Fallback: Oops, unable to copy');
        }
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      logger.error({ error: err }, 'Failed to copy: ');
    }
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
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
            
            <AgentActivityLog 
              toolCalls={message.tool_calls} 
              reasoningContent={message.reasoning_content} 
            />
            
            {message.reasoning_content && (
              <div 
                style={{
                  backgroundColor: 'hsl(var(--bg-deep) / 0.5)',
                  border: '1px solid hsl(var(--border-subtle))',
                  borderRadius: 'var(--border-radius-md)',
                  marginBottom: '12px',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <button
                  onClick={() => setShowReasoning(!showReasoning)}
                  style={{
                    width: '100%',
                    background: 'hsl(var(--bg-card))',
                    border: 'none',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'hsl(var(--text-main))',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'hsl(var(--bg-card) / 0.8)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'hsl(var(--bg-card))'}
                >
                  <BrainCircuit size={15} style={{ color: 'hsl(var(--accent-secondary))' }} />
                  Processo de Raciocínio
                  <div style={{ marginLeft: 'auto', color: 'hsl(var(--text-muted))' }}>
                    {showReasoning ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </div>
                </button>
                {showReasoning && (
                  <div style={{
                    padding: '12px 14px',
                    borderTop: '1px solid hsl(var(--border-subtle))',
                    color: 'hsl(var(--text-secondary))',
                    fontSize: '0.82rem',
                    fontFamily: 'var(--font-sans)',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    fontStyle: 'italic',
                    background: 'hsl(var(--bg-deep) / 0.3)',
                  }}>
                    {message.reasoning_content}
                  </div>
                )}
              </div>
            )}
            
            {message.tool_calls && message.tool_calls.map((tc: ToolCall, i: number) => (
              <ToolCallBox key={i} toolCall={tc} isGenerating={message.isGenerating} />
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
        {/* Message body */}
        <div style={{
          fontSize: '0.94rem',
          color: isUser ? 'hsl(var(--text-pure))' : 'hsl(var(--text-main))',
          wordBreak: 'break-word',
        }}>
          {isUser ? (
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
              {typeof content === 'string' ? (
                <p>{content}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {content.map((part, idx) => {
                    if (part.type === 'text') {
                      return <p key={idx}>{part.text}</p>;
                    } else if (part.type === 'image_url') {
                      return (
                        <div key={idx} style={{ maxWidth: '300px', borderRadius: '8px', overflow: 'hidden' }}>
                          <img src={part.image_url.url} alt="anexo" style={{ width: '100%', height: 'auto', display: 'block' }} />
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </div>
          ) : (
            <MarkdownRenderer content={typeof content === 'string' ? content : content.filter(p => p.type === 'text').map(p => p.text).join('\n')} />
          )}
        </div>
      </div>
    </div>
  );
}
