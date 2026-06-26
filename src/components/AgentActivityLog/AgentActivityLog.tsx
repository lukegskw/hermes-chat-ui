import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Brain,
  Wrench,
  GitMerge,
  Activity,
  Check,
} from "../Icons";
import { ToolCall } from "../../types";
import { useTranslation } from "react-i18next";
import { MarkdownRenderer } from "../MarkdownRenderer";
import styles from "./AgentActivityLog.module.scss";

export type AgentActivityLogProps = {
  toolCalls?: ToolCall[];
  reasoningContent?: string;
  isGenerating?: boolean;
  extractedCodes?: string[];
};

const ToolItem = ({
  tc,
  isGenerating,
  isDelegate,
  injectedCode,
}: {
  tc: ToolCall;
  isGenerating: boolean;
  isDelegate: boolean;
  injectedCode?: string;
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = isDelegate ? GitMerge : Wrench;

  let formattedArgs = "";
  const args = tc.function.arguments || tc.label || "";

  if (injectedCode) {
    const lang = tc.function.name === "run_python" ? "python" : "python";
    formattedArgs = `\`\`\`${lang}\n${injectedCode}\n\`\`\``;
  } else if (args) {
    if (
      tc.function.name === "execute_code" ||
      tc.function.name === "run_python"
    ) {
      try {
        const parsed = JSON.parse(args);
        const code = parsed.code || parsed.content || args;
        const lang = tc.function.name === "run_python" ? "python" : "code";
        formattedArgs = `\`\`\`${lang}\n${code}\n\`\`\``;
      } catch {
        const cleanedArgs = args.replace(/\\n/g, "\n");
        formattedArgs = `\`\`\`code\n${cleanedArgs}\n\`\`\``;
      }
    } else {
      try {
        const parsed = JSON.parse(args);
        formattedArgs = `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
      } catch {
        const cleanedArgs = args.replace(/\\n/g, "\n");
        formattedArgs = `\`\`\`json\n${cleanedArgs}\n\`\`\``;
      }
    }
  }

  const isRunning = tc.status === "running" || (isGenerating && !tc.status);
  const isError = tc.status === "error";

  return (
    <div className={styles.node}>
      <div
        className={`${styles.icon} ${isDelegate ? styles.delegate : styles.default}`}
      >
        <Icon size={12} />
      </div>
      <div className={styles.content}>
        <div
          className={styles.toolItem}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className={styles.toolHeader}>
            <div className={styles.title}>{tc.function.name}</div>
            <div className={styles.toolStatus}>
              {isRunning ? (
                <div className={styles.spinner} />
              ) : isError ? (
                <span style={{ color: "red", fontWeight: "bold" }}>!</span>
              ) : (
                <Check size={14} />
              )}
            </div>
          </div>
          <div className={styles.description}>
            {isRunning
              ? isDelegate
                ? t("activity.delegatingTask")
                : t("activity.executingTool")
              : isDelegate
                ? t("activity.taskDelegated")
                : t("activity.toolExecuted")}
          </div>
        </div>
        {isExpanded && formattedArgs && (
          <div className={styles.toolArgs}>
            <MarkdownRenderer content={formattedArgs} />
          </div>
        )}
      </div>
    </div>
  );
};

export const AgentActivityLog = ({
  toolCalls = [],
  reasoningContent,
  isGenerating = false,
  extractedCodes,
}: AgentActivityLogProps) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const hasContent = toolCalls.length > 0 || !!reasoningContent;

  if (!hasContent) {
    return null;
  }

  const delegationsCount = toolCalls.filter(
    (tc) =>
      tc.function.name === "delegate_task" || tc.function.name === "delegate",
  ).length;
  const standardToolsCount = toolCalls.length - delegationsCount;

  const summaryParts = [];
  if (reasoningContent) summaryParts.push(t("activity.reasoning"));
  if (standardToolsCount > 0)
    summaryParts.push(`${standardToolsCount} ${t("activity.tools")}`);
  if (delegationsCount > 0)
    summaryParts.push(`${delegationsCount} ${t("activity.subAgents")}`);

  const summaryText = summaryParts.join(" · ");

  return (
    <div className={styles.log}>
      <div
        className={styles.summary}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={styles.summaryText}>
          <Activity size={14} />
          <span>
            {t("activity.agentActivity")} {summaryText}
          </span>
        </div>
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>

      {isExpanded && (
        <div className={styles.timeline}>
          {reasoningContent && (
            <div className={styles.node}>
              <div className={`${styles.icon} ${styles.default}`}>
                <Brain size={12} />
              </div>
              <div className={styles.content}>
                <div className={styles.title}>
                  {t("activity.thoughtProcess")}
                </div>
                <div className={styles.description}>{reasoningContent}</div>
              </div>
            </div>
          )}

          {(() => {
            let pythonToolIndex = 0;
            return toolCalls.map((tc, index) => {
              const isDelegate =
                tc.function.name === "delegate_task" ||
                tc.function.name === "delegate";

              const isPythonTool =
                tc.function.name === "execute_code" ||
                tc.function.name === "run_python";

              let injectedCode;
              if (isPythonTool && extractedCodes) {
                injectedCode = extractedCodes[pythonToolIndex];
                pythonToolIndex++;
              }

              return (
                <ToolItem
                  key={index}
                  tc={tc}
                  isGenerating={isGenerating}
                  isDelegate={isDelegate}
                  injectedCode={injectedCode}
                />
              );
            });
          })()}
        </div>
      )}
    </div>
  );
};
