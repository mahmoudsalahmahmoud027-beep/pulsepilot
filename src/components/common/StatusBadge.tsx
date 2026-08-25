import React from 'react';
import { HealthState, IncidentStatus, AlertStatus } from '../../types';

interface StatusBadgeProps {
  status: HealthState | IncidentStatus | AlertStatus | string;
  size?: 'sm' | 'md';
  showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showDot = true,
}) => {
  const s = status.toUpperCase();

  let bg = 'bg-slate-800/80 text-slate-300 border-slate-700/60';
  let dot = 'bg-slate-400';

  if (s === 'HEALTHY' || s === 'RESOLVED' || s === 'SUCCEEDED') {
    bg = 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50';
    dot = 'bg-emerald-400';
  } else if (s === 'DEGRADED' || s === 'MONITORING' || s === 'ACKNOWLEDGED') {
    bg = 'bg-amber-950/40 text-amber-300 border-amber-800/50';
    dot = 'bg-amber-400';
  } else if (s === 'AT_RISK' || s === 'IDENTIFIED') {
    bg = 'bg-orange-950/40 text-orange-300 border-orange-800/50';
    dot = 'bg-orange-400';
  } else if (s === 'CRITICAL' || s === 'INVESTIGATING' || s === 'FAILED' || s === 'OPEN') {
    bg = 'bg-rose-950/40 text-rose-300 border-rose-800/50';
    dot = 'bg-rose-400';
  }

  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono font-medium rounded border tracking-wide uppercase ${bg} ${padding}`}
    >
      {showDot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
      )}
      <span>{status}</span>
    </span>
  );
};
