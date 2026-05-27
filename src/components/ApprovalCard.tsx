import { PendingApproval } from '../utils/api';
import { Check, Unlock, Lock, X } from 'lucide-react';

interface ApprovalCardProps {
  approval: PendingApproval;
  onRespond: (choice: 'once' | 'session' | 'always' | 'deny') => void;
}

export function ApprovalCard({ approval, onRespond }: ApprovalCardProps) {
  return (
    <div className="approval-card glass animate-slide-up">
      <div className="approval-card-header">
        <div className="approval-card-icon pulse-attention">
          <Lock size={18} className="text-amber" />
        </div>
        <div className="approval-card-title">
          <h3>Ação Requer Aprovação</h3>
          <p>O agente solicitou permissão para executar uma ferramenta.</p>
        </div>
      </div>

      <div className="approval-card-details">
        <div className="detail-row">
          <span className="detail-label">Ferramenta:</span>
          <code className="detail-value text-accent">{approval.tool}</code>
        </div>
        <div className="detail-row">
          <span className="detail-label">Comando:</span>
          <pre className="detail-code">{approval.command || approval.label || 'N/A'}</pre>
        </div>
      </div>

      <div className="approval-card-actions">
        <button 
          onClick={() => onRespond('once')} 
          className="btn btn-primary approval-btn-allow"
          title="Permitir a execução apenas desta vez"
        >
          <Check size={16} /> Permitir 1x
        </button>
        <button 
          onClick={() => onRespond('session')} 
          className="btn btn-secondary approval-btn-session"
          title="Permitir automaticamente durante esta sessão"
        >
          <Unlock size={16} /> Nesta Sessão
        </button>
        <button 
          onClick={() => onRespond('always')} 
          className="btn btn-tertiary approval-btn-always"
          title="Lembrar permissão e nunca mais perguntar para este comando"
        >
          <Unlock size={16} /> Sempre
        </button>
        <button 
          onClick={() => onRespond('deny')} 
          className="btn btn-danger approval-btn-deny"
          title="Negar e cancelar execução"
        >
          <X size={16} /> Negar
        </button>
      </div>
    </div>
  );
}
