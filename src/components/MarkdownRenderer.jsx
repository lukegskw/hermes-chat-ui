import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const CodeBlock = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Simple, elegant syntax highlighting simulation
  const highlightCode = (rawCode, lang) => {
    if (!rawCode) return '';
    
    // Quick regex replacements for basic token highlighting (safe & fast)
    let escaped = rawCode
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
      
    // Highlights keywords
    const keywords = /\b(const|let|var|function|return|import|export|from|default|class|extends|if|else|for|while|try|catch|async|await|new|this|typeof|instanceof|true|false|null|undefined|import|from)\b/g;
    escaped = escaped.replace(keywords, '<span class="code-keyword">$1</span>');
    
    // Highlights strings
    escaped = escaped.replace(/(["'`])(.*?)\1/g, '<span class="code-string">"$2"</span>');
    
    // Highlights comments
    escaped = escaped.replace(/(\/\/.*|\/\*[\s\S]*?\*\/)/g, '<span class="code-comment">$1</span>');
    
    // Highlights numbers
    escaped = escaped.replace(/\b(\d+)\b/g, '<span class="code-number">$1</span>');

    return <span dangerouslySetInnerHTML={{ __html: escaped }} />;
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="lang">{language || 'code'}</span>
        <button className="copy-btn" onClick={handleCopy} title="Copy code">
          {copied ? (
            <>
              <Check size={13} className="text-emerald" />
              <span style={{ color: '#10b981' }}>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre>
        <code>{highlightCode(code, language)}</code>
      </pre>
    </div>
  );
};

export default function MarkdownRenderer({ content = '' }) {
  if (!content) return null;

  // Split content by code blocks to separate code and text
  const parts = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)(?:```|$)/g;
  
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push({ type: 'markdown', value: textBefore });
    }
    parts.push({
      type: 'code',
      language: match[1],
      value: match[2].trimEnd()
    });
    lastIndex = codeBlockRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    const textAfter = content.substring(lastIndex);
    // If the last code block is unclosed (streaming), extract it as code
    if (content.substring(lastIndex).startsWith('```')) {
      const firstLineBreak = textAfter.indexOf('\n');
      const lang = firstLineBreak !== -1 ? textAfter.substring(3, firstLineBreak) : '';
      const code = firstLineBreak !== -1 ? textAfter.substring(firstLineBreak + 1) : '';
      parts.push({
        type: 'code',
        language: lang,
        value: code
      });
    } else {
      parts.push({ type: 'markdown', value: textAfter });
    }
  }

  const renderMarkdownText = (text) => {
    // Process markdown line by line
    const lines = text.split('\n');
    let insideList = false;
    let listType = null; // 'ul' or 'ol'
    let listItems = [];
    const elements = [];

    const flushList = (key) => {
      if (listItems.length > 0) {
        const Tag = listType === 'ol' ? 'ol' : 'ul';
        elements.push(
          <Tag key={`list-${key}`} style={{ marginLeft: '1.5rem', marginBottom: '0.75rem' }}>
            {listItems.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '0.25rem' }}>{renderInline(item)}</li>
            ))}
          </Tag>
        );
        listItems = [];
        insideList = false;
      }
    };

    // Helper to render bold, italics, inline code, and links
    const renderInline = (str) => {
      if (!str) return '';
      
      const tokens = [];
      let currentIdx = 0;
      
      // Inline token matchers
      const inlineRegex = /(\*\*|__)(.*?)\1|(`)(.*?)\3|(!?\[)(.*?)( \] \( (.*?) \))/g; // formatted for safe parsing
      // simpler regex for inline elements:
      // Bold: \*\*(.*?)\*\*
      // Code: `(.*?)`
      // Link: \[(.*?)\]\((.*?)\)
      const boldRegex = /\*\*(.*?)\*\*/g;
      const codeRegex = /`(.*?)`/g;
      const linkRegex = /\[(.*?)\]\((.*?)\)/g;

      // Replace bold
      let temp = str;
      let boldMatch;
      
      // For simplicity, we can do safe string parsing by matching all tokens sequentially.
      // Let's implement a robust inline parser:
      const parts = [];
      let i = 0;
      while (i < str.length) {
        // Check for inline code
        if (str[i] === '`') {
          const closeIdx = str.indexOf('`', i + 1);
          if (closeIdx !== -1) {
            parts.push(<code key={`code-${i}`}>{str.substring(i + 1, closeIdx)}</code>);
            i = closeIdx + 1;
            continue;
          }
        }
        // Check for bold
        if (str[i] === '*' && str[i + 1] === '*') {
          const closeIdx = str.indexOf('**', i + 2);
          if (closeIdx !== -1) {
            parts.push(<strong key={`bold-${i}`}>{renderInline(str.substring(i + 2, closeIdx))}</strong>);
            i = closeIdx + 2;
            continue;
          }
        }
        // Check for link
        if (str[i] === '[') {
          const closeTextIdx = str.indexOf(']', i + 1);
          if (closeTextIdx !== -1 && str[closeTextIdx + 1] === '(') {
            const closeUrlIdx = str.indexOf(')', closeTextIdx + 2);
            if (closeUrlIdx !== -1) {
              const text = str.substring(i + 1, closeTextIdx);
              const url = str.substring(closeTextIdx + 2, closeUrlIdx);
              parts.push(<a key={`link-${i}`} href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'hsl(var(--accent-primary))', textDecoration: 'none' }}>{text}</a>);
              i = closeUrlIdx + 1;
              continue;
            }
          }
        }
        
        // Accumulate plain characters
        let plainChar = str[i];
        if (parts.length > 0 && typeof parts[parts.length - 1] === 'string') {
          parts[parts.length - 1] += plainChar;
        } else {
          parts.push(plainChar);
        }
        i++;
      }
      return parts;
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      // Headers
      if (trimmed.startsWith('# ')) {
        flushList(idx);
        elements.push(<h1 key={idx} style={{ fontSize: '1.5rem', fontWeight: 600, color: 'white', margin: '1.2rem 0 0.5rem' }}>{renderInline(trimmed.substring(2))}</h1>);
      } else if (trimmed.startsWith('## ')) {
        flushList(idx);
        elements.push(<h2 key={idx} style={{ fontSize: '1.25rem', fontWeight: 600, color: 'white', margin: '1.1rem 0 0.5rem' }}>{renderInline(trimmed.substring(3))}</h2>);
      } else if (trimmed.startsWith('### ')) {
        flushList(idx);
        elements.push(<h3 key={idx} style={{ fontSize: '1.1rem', fontWeight: 600, color: 'white', margin: '1rem 0 0.4rem' }}>{renderInline(trimmed.substring(4))}</h3>);
      } 
      // Blockquote
      else if (trimmed.startsWith('>')) {
        flushList(idx);
        elements.push(
          <blockquote key={idx} style={{
            borderLeft: '3px solid hsl(var(--accent-primary))',
            paddingLeft: '0.75rem',
            margin: '0.75rem 0',
            color: 'hsl(var(--text-secondary))',
            fontStyle: 'italic',
            background: 'hsl(var(--bg-surface) / 0.4)',
            borderRadius: '0 var(--border-radius-sm) var(--border-radius-sm) 0',
            paddingTop: '4px',
            paddingBottom: '4px'
          }}>
            {renderInline(trimmed.substring(1).trim())}
          </blockquote>
        );
      }
      // Unordered List Items
      else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (!insideList || listType !== 'ul') {
          flushList(idx);
          insideList = true;
          listType = 'ul';
        }
        listItems.push(trimmed.substring(2));
      }
      // Ordered List Items
      else if (/^\d+\.\s/.test(trimmed)) {
        if (!insideList || listType !== 'ol') {
          flushList(idx);
          insideList = true;
          listType = 'ol';
        }
        const itemText = trimmed.replace(/^\d+\.\s/, '');
        listItems.push(itemText);
      }
      // Empty Line
      else if (trimmed === '') {
        flushList(idx);
      }
      // Regular Paragraph
      else {
        flushList(idx);
        elements.push(<p key={idx} style={{ marginBottom: '0.75rem', lineHeight: 1.6 }}>{renderInline(line)}</p>);
      }
    });

    // Flush any remaining list at the end
    flushList(lines.length);

    return elements;
  };

  return (
    <div className="prose">
      {parts.map((part, index) => {
        if (part.type === 'code') {
          return <CodeBlock key={index} language={part.language} code={part.value} />;
        } else {
          return <React.Fragment key={index}>{renderMarkdownText(part.value)}</React.Fragment>;
        }
      })}
    </div>
  );
}
