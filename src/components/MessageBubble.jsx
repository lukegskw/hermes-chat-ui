import React, { useState } from 'react';
import { Copy, Check, Bot, User, Sparkles } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

export default function MessageBubble({ message }) {
  const { role, content, timestamp } = message;
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const formatTime = (timeStr) => {
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
          group: 'true',
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
