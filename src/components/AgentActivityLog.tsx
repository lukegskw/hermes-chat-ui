import { useState } from 'react';
import { ChevronDown, ChevronRight, Brain, Wrench, GitMerge, Activity } from 'lucide-react';
import { ToolCall } from '../utils/api';
import './AgentActivityLog.css';

interface AgentActivityLogProps {
  toolCalls?: ToolCall[];
  reasoningContent?: string;
  isGenerating?: boolean;
}

export function AgentActivityLog({ toolCalls = [], reasoningContent, isGenerating = false }: AgentActivityLogProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const hasContent = toolCalls.length > 0 || !!reasoningContent;
  
  if (!hasContent) {
    return null;
  }
  
  const delegationsCount = toolCalls.filter(tc => tc.function.name === 'delegate_task' || tc.function.name === 'delegate').length;
  const standardToolsCount = toolCalls.length - delegationsCount;
  
  const summaryParts = [];
  if (reasoningContent) summaryParts.push('Raciocínio');
  if (standardToolsCount > 0) summaryParts.push(`${standardToolsCount} ferramentas`);
  if (delegationsCount > 0) summaryParts.push(`${delegationsCount} sub-agentes`);
  
  const summaryText = summaryParts.join(' · ');
  
  return (
    <div className="activity-log">
      <div className="activity-log-summary" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="summary-text">
          <Activity size={14} />
          <span>Atividade do Agente: {summaryText}</span>
        </div>
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>
      
      {isExpanded && (
        <div className="activity-timeline animate-fade">
          {reasoningContent && (
            <div className="timeline-node">
              <div className="node-icon">
                <Brain size={12} />
              </div>
              <div className="node-content">
                <div className="node-title">Processo de Pensamento</div>
                <div className="node-description">{reasoningContent}</div>
              </div>
            </div>
          )}
          
          {toolCalls.map((tc, index) => {
            const isDelegate = tc.function.name === 'delegate_task' || tc.function.name === 'delegate';
            const Icon = isDelegate ? GitMerge : Wrench;
            
            return (
              <div className="timeline-node" key={index}>
                <div className="node-icon" style={{ color: isDelegate ? 'hsl(280 80% 60%)' : 'hsl(var(--accent-primary))' }}>
                  <Icon size={12} />
                </div>
                <div className="node-content">
                  <div className="node-title">{tc.function.name}</div>
                  <div className="node-description">
                    {isGenerating 
                      ? (isDelegate ? 'Delegando tarefa...' : 'Executando ferramenta...') 
                      : (isDelegate ? 'Tarefa delegada.' : 'Ferramenta executada.')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
