import { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  BrainCircuit,
  Wrench,
  GitMerge,
  Activity,
  Check,
} from "../Icons";
import { ToolCall } from "../../types";
import { useTranslation } from "react-i18next";
import { MarkdownRenderer } from "../MarkdownRenderer";
import styles from "./AgentActivityLog.module.scss";
import { ThinkingIndicator } from "../ThinkingIndicator/ThinkingIndicador";

export type AgentActivityLogProps = {
  toolCalls?: ToolCall[];
  isGenerating?: boolean;
};

const ToolItem = ({
  tc,
  isGenerating,
  isDelegate,
}: {
  tc: ToolCall;
  isGenerating: boolean;
  isDelegate: boolean;
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = isDelegate ? GitMerge : Wrench;

  let formattedArgs = "";
  const args = tc.function.arguments || tc.label || "";
  if (args) {
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

const AgentLog = ({
  icon,
  title,
  initiallyExpanded,
  expandedElement,
  isStreaming,
}: {
  icon?: React.ReactNode;
  title: string;
  initiallyExpanded?: boolean;
  expandedElement?: React.ReactNode;
  isStreaming?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const timelineRef = useRef<HTMLDivElement>(null);
  const wasStreaming = useRef(isStreaming);

  useEffect(() => {
    // Auto collapse when streaming finishes
    if (wasStreaming.current && !isStreaming) {
      setIsExpanded(false);
    }
    wasStreaming.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    // Auto scroll to bottom during streaming
    if (isStreaming && timelineRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated before scrolling
      requestAnimationFrame(() => {
        if (timelineRef.current) {
          const el = timelineRef.current;
          el.scrollTop = el.scrollHeight;
        }
      });
    }
  }, [expandedElement, isStreaming]);

  return (
    <div className={styles.log}>
      <div
        className={styles.summary}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={styles.summaryText}>
          {icon}
          <span>{title}</span>
        </div>
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>

      <div
        ref={timelineRef}
        className={`${styles.timelineWrapper} ${isExpanded ? styles.expanded : ""} ${isStreaming ? styles.isStreaming : ""}`}
      >
        <div className={styles.timeline}>{expandedElement}</div>
      </div>
    </div>
  );
};

export const AgentActivityLog = ({
  toolCalls = [],
  isGenerating = false,
}: AgentActivityLogProps) => {
  const { t } = useTranslation();

  const hasContent = toolCalls.length > 0;

  if (!hasContent) {
    return null;
  }

  const delegationsCount = toolCalls.filter(
    (tc) =>
      tc.function.name === "delegate_task" || tc.function.name === "delegate",
  ).length;
  const standardToolsCount = toolCalls.length - delegationsCount;

  const summaryParts = [];
  if (standardToolsCount > 0)
    summaryParts.push(`${standardToolsCount} ${t("activity.tools")}`);
  if (delegationsCount > 0)
    summaryParts.push(`${delegationsCount} ${t("activity.subAgents")}`);

  const summaryText = t("activity.agentActivity") + summaryParts.join(" · ");

  return (
    <AgentLog
      icon={<Activity size={14} />}
      title={summaryText}
      isStreaming={isGenerating}
      expandedElement={
        <div className={styles.timeline}>
          {toolCalls.map((tc, index) => {
            const isDelegate =
              tc.function.name === "delegate_task" ||
              tc.function.name === "delegate";

            return (
              <ToolItem
                key={index}
                tc={tc}
                isGenerating={isGenerating}
                isDelegate={isDelegate}
              />
            );
          })}
        </div>
      }
    />
  );
};

export const ReasoningLog = ({
  reasoningContent,
  initiallyExpanded,
}: {
  reasoningContent?: string;
  initiallyExpanded?: boolean;
}) => {
  const { t } = useTranslation();

  if (!reasoningContent) return null;

  return (
    <AgentLog
      icon={<BrainCircuit size={14} />}
      title={t("messages.reasoningProcess")}
      initiallyExpanded={initiallyExpanded}
      isStreaming={initiallyExpanded}
      expandedElement={
        <>
          <MarkdownRenderer content={reasoningContent} />
          <ThinkingIndicator
            visible={initiallyExpanded}
            label={t("messages.reasoning")}
          />
        </>
      }
    />
  );
};
