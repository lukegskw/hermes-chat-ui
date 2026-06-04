import { useState } from "react";
import {
  TerminalSquare,
  GitMerge,
  Code,
  Wrench,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  XCircle,
} from "../Icons";
import { ToolCall } from "../../types";
import styles from "./ToolCallBox.module.scss";

export type ToolCallBoxProps = {
  toolCall: ToolCall;
  isGenerating?: boolean;
};

export const ToolCallBox = ({ toolCall, isGenerating }: ToolCallBoxProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const name = toolCall.function.name;

  // Determine tool type for visual distinction
  const isDelegate = name === "delegate_task" || name === "delegate";
  const isExecute = name === "execute_code" || name === "run_python";
  const isMcp = name.startsWith("mcp_");

  let typeClass = "";
  let Icon = isMcp ? TerminalSquare : Wrench;

  if (isDelegate) {
    typeClass = styles.typeDelegate;
    Icon = GitMerge;
  } else if (isExecute) {
    typeClass = styles.typeExecute;
    Icon = Code;
  }

  const isRunning =
    toolCall.status === "running" ||
    (toolCall.status === undefined && isGenerating);
  const isError = toolCall.status === "error";

  return (
    <div className={`${styles.box} ${typeClass}`}>
      <div
        className={styles.header}
        onClick={() => setIsExpanded(!isExpanded)}
        title={name}
      >
        {isExpanded ? (
          <ChevronDown size={14} opacity={0.5} />
        ) : (
          <ChevronRight size={14} opacity={0.5} />
        )}
        <Icon size={14} />

        <span className={styles.name}>{name}</span>

        <div className={styles.status}>
          {isRunning ? (
            <div className={styles.spinner} />
          ) : isError ? (
            <XCircle size={14} style={{ color: "var(--color-danger)" }} />
          ) : (
            <CheckCircle2 size={14} opacity={0.7} />
          )}
        </div>
      </div>

      {isExpanded && toolCall.function.arguments && (
        <div className={styles.args}>{toolCall.function.arguments}</div>
      )}
    </div>
  );
};
