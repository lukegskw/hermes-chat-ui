import React, { useState } from "react";
import { Check, Copy } from "../Icons";
import { logger } from "../../utils";
import styles from "./MarkdownRenderer.module.scss";

type CodeBlockProps = {
  language: string;
  code: string;
};

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error({ error: err }, "Failed to copy text");
    }
  };

  // Simple, elegant syntax highlighting simulation
  const highlightCode = (rawCode: string) => {
    if (!rawCode) return "";

    // Quick regex replacements for basic token highlighting (safe & fast)
    let escaped = rawCode
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Highlights keywords
    const keywords =
      /\b(const|let|var|function|return|import|export|from|default|class|extends|if|else|for|while|try|catch|async|await|new|this|typeof|instanceof|true|false|null|undefined)\b/g;
    escaped = escaped.replace(keywords, '<span class="code-keyword">$1</span>');

    // Highlights strings
    escaped = escaped.replace(
      /(["'`])(.*?)\1/g,
      '<span class="code-string">"$2"</span>',
    );

    // Highlights comments
    escaped = escaped.replace(
      /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
      '<span class="code-comment">$1</span>',
    );

    // Highlights numbers
    escaped = escaped.replace(
      /\b(\d+)\b/g,
      '<span class="code-number">$1</span>',
    );

    return <span dangerouslySetInnerHTML={{ __html: escaped }} />;
  };

  return (
    <div className={styles.codeBlockWrapper}>
      <div className={styles.codeBlockHeader}>
        <span className={styles.lang}>{language || "code"}</span>
        <button
          className={styles.copyBtn}
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={13} className={styles.codeIconSuccess} />
              <span className={styles.codeTextSuccess}>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <pre className={styles.codeBlockPre}>
        <code className={styles.codeBlockCode}>{highlightCode(code)}</code>
      </pre>
    </div>
  );
};

type Part = {
  type: "markdown" | "code";
  language?: string;
  value: string;
};

export type MarkdownRendererProps = {
  content?: string;
};

export const MarkdownRenderer = ({ content = "" }: MarkdownRendererProps) => {
  if (!content) return null;

  // Split content by code blocks to separate code and text
  const parts: Part[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)(?:```|$)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push({ type: "markdown", value: textBefore });
    }
    parts.push({
      type: "code",
      language: match[1],
      value: match[2].trimEnd(),
    });
    lastIndex = codeBlockRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    const textAfter = content.substring(lastIndex);
    // If the last code block is unclosed (streaming), extract it as code
    if (content.substring(lastIndex).startsWith("```")) {
      const firstLineBreak = textAfter.indexOf("\n");
      const lang =
        firstLineBreak !== -1 ? textAfter.substring(3, firstLineBreak) : "";
      const code =
        firstLineBreak !== -1 ? textAfter.substring(firstLineBreak + 1) : "";
      parts.push({
        type: "code",
        language: lang,
        value: code,
      });
    } else {
      parts.push({ type: "markdown", value: textAfter });
    }
  }

  const renderMarkdownText = (text: string) => {
    // Process markdown line by line
    const lines = text.split("\n");
    let insideList = false;
    let listType: "ul" | "ol" | null = null;
    let listItems: string[] = [];
    const elements: React.ReactNode[] = [];

    const flushList = (key: number) => {
      if (listItems.length > 0) {
        const Tag = listType === "ol" ? "ol" : "ul";
        elements.push(
          <Tag key={`list-${key}`} className={styles.list}>
            {listItems.map((item, idx) => (
              <li key={idx} className={styles.listItem}>
                {renderInline(item)}
              </li>
            ))}
          </Tag>,
        );
        listItems = [];
        insideList = false;
      }
    };

    // Helper to render bold, italics, inline code, and links
    const renderInline = (str: string): React.ReactNode[] => {
      if (!str) return [];

      const parts: React.ReactNode[] = [];
      let i = 0;
      while (i < str.length) {
        // Check for inline code
        if (str[i] === "`") {
          const closeIdx = str.indexOf("`", i + 1);
          if (closeIdx !== -1) {
            parts.push(
              <code key={`code-${i}`} className={styles.inlineCode}>
                {str.substring(i + 1, closeIdx)}
              </code>,
            );
            i = closeIdx + 1;
            continue;
          }
        }
        // Check for bold
        if (str[i] === "*" && str[i + 1] === "*") {
          const closeIdx = str.indexOf("**", i + 2);
          if (closeIdx !== -1) {
            parts.push(
              <strong key={`bold-${i}`}>
                {renderInline(str.substring(i + 2, closeIdx))}
              </strong>,
            );
            i = closeIdx + 2;
            continue;
          }
        }
        // Check for link
        if (str[i] === "[") {
          const closeTextIdx = str.indexOf("]", i + 1);
          if (closeTextIdx !== -1 && str[closeTextIdx + 1] === "(") {
            const closeUrlIdx = str.indexOf(")", closeTextIdx + 2);
            if (closeUrlIdx !== -1) {
              const text = str.substring(i + 1, closeTextIdx);
              const url = str.substring(closeTextIdx + 2, closeUrlIdx);
              parts.push(
                <a
                  key={`link-${i}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.link}
                >
                  {text}
                </a>,
              );
              i = closeUrlIdx + 1;
              continue;
            }
          }
        }

        // Accumulate plain characters
        const plainChar = str[i];
        const lastPart = parts[parts.length - 1];
        if (parts.length > 0 && typeof lastPart === "string") {
          parts[parts.length - 1] = lastPart + plainChar;
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
      if (trimmed.startsWith("# ")) {
        flushList(idx);
        elements.push(
          <h1 key={idx} className={styles.h1}>
            {renderInline(trimmed.substring(2))}
          </h1>,
        );
      } else if (trimmed.startsWith("## ")) {
        flushList(idx);
        elements.push(
          <h2 key={idx} className={styles.h2}>
            {renderInline(trimmed.substring(3))}
          </h2>,
        );
      } else if (trimmed.startsWith("### ")) {
        flushList(idx);
        elements.push(
          <h3 key={idx} className={styles.h3}>
            {renderInline(trimmed.substring(4))}
          </h3>,
        );
      }
      // Blockquote
      else if (trimmed.startsWith(">")) {
        flushList(idx);
        elements.push(
          <blockquote key={idx} className={styles.blockquote}>
            {renderInline(trimmed.substring(1).trim())}
          </blockquote>,
        );
      }
      // Unordered List Items
      else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        if (!insideList || listType !== "ul") {
          flushList(idx);
          insideList = true;
          listType = "ul";
        }
        listItems.push(trimmed.substring(2));
      }
      // Ordered List Items
      else if (/^\d+\.\s/.test(trimmed)) {
        if (!insideList || listType !== "ol") {
          flushList(idx);
          insideList = true;
          listType = "ol";
        }
        const itemText = trimmed.replace(/^\d+\.\s/, "");
        listItems.push(itemText);
      }
      // Empty Line
      else if (trimmed === "") {
        flushList(idx);
      }
      // Regular Paragraph
      else {
        flushList(idx);
        elements.push(
          <p key={idx} className={styles.p}>
            {renderInline(line)}
          </p>,
        );
      }
    });

    // Flush any remaining list at the end
    flushList(lines.length);

    return elements;
  };

  return (
    <div className={styles.prose}>
      {parts.map((part, index) => {
        if (part.type === "code") {
          return (
            <CodeBlock
              key={index}
              language={part.language || ""}
              code={part.value}
            />
          );
        } else {
          return (
            <React.Fragment key={index}>
              {renderMarkdownText(part.value)}
            </React.Fragment>
          );
        }
      })}
    </div>
  );
};
