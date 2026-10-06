import { StatusPill } from '@/components/ds/StatusPill';
import { PRIOR_CONNECTION_BADGE_LABEL } from '@/lib/connections/priorConnectionMeta';

/** Marks someone you knew before Click (profile header and connection rows). */
export function PriorConnectionBadge({ className }: { className?: string }) {
  return (
    <StatusPill variant="warning" className={className}>
      {PRIOR_CONNECTION_BADGE_LABEL}
    </StatusPill>
  );
}
