import React, { useState } from 'react';
import { TerminalSquare, GitMerge, Code, Wrench, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { ToolCall } from '../utils/api';
import './ToolCallBox.css';

interface ToolCallBoxProps {
  toolCall: ToolCall;
  isGenerating?: boolean;
}

export function ToolCallBox({ toolCall, isGenerating }: ToolCallBoxProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const name = toolCall.function.name;
  
  // Determine tool type for visual distinction
  const isDelegate = name === 'delegate_task' || name === 'delegate';
  const isExecute = name === 'execute_code' || name === 'run_python';
  const isMcp = name.startsWith('mcp_');
  
  let typeClass = 'type-default';
  let Icon = isMcp ? TerminalSquare : Wrench;
  
  if (isDelegate) {
    typeClass = 'type-delegate';
    Icon = GitMerge;
  } else if (isExecute) {
    typeClass = 'type-execute';
    Icon = Code;
  }
  
  return (
    <div className={`tool-call-box ${typeClass}`}>
      <div 
        className={`tool-call-header ${typeClass}`}
        onClick={() => setIsExpanded(!isExpanded)}
        title={name}
      >
        {isExpanded ? <ChevronDown size={14} opacity={0.5} /> : <ChevronRight size={14} opacity={0.5} />}
        <Icon size={14} />
        
        <span className="tool-call-name">
          {name}
        </span>
        
        <div className="tool-call-status">
          {isGenerating ? (
            <div className="status-spinner" />
          ) : (
            <CheckCircle2 size={14} opacity={0.7} />
          )}
        </div>
      </div>
      
      {isExpanded && toolCall.function.arguments && (
        <div className="tool-call-args animate-fade">
          {toolCall.function.arguments}
        </div>
      )}
    </div>
  );
}
