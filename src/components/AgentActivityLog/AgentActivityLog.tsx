import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Brain,
  Wrench,
  GitMerge,
  Activity,
} from "../Icons";
import { ToolCall } from "../../types";
import { useTranslation } from "react-i18next";
import styles from "./AgentActivityLog.module.scss";

export type AgentActivityLogProps = {
  toolCalls?: ToolCall[];
  reasoningContent?: string;
  isGenerating?: boolean;
};

export const AgentActivityLog = ({
  toolCalls = [],
  reasoningContent,
  isGenerating = false,
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

          {toolCalls.map((tc, index) => {
            const isDelegate =
              tc.function.name === "delegate_task" ||
              tc.function.name === "delegate";
            const Icon = isDelegate ? GitMerge : Wrench;

            return (
              <div className={styles.node} key={index}>
                <div
                  className={`${styles.icon} ${isDelegate ? styles.delegate : styles.default}`}
                >
                  <Icon size={12} />
                </div>
                <div className={styles.content}>
                  <div className={styles.title}>{tc.function.name}</div>
                  <div className={styles.description}>
                    {isGenerating
                      ? isDelegate
                        ? t("activity.delegatingTask")
                        : t("activity.executingTool")
                      : isDelegate
                        ? t("activity.taskDelegated")
                        : t("activity.toolExecuted")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
