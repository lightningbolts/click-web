import { FcChip } from '@/components/fc';
import { cn } from '@/lib/cn';
import { PRIOR_CONNECTION_BADGE_LABEL } from '@/lib/connections/priorConnections';

/** Amber pill reused on profile header and connection list rows. */
export function PriorConnectionBadge({ className }: { className?: string }) {
  return (
    <FcChip
      className={cn(
        'border-amber-400/50 bg-amber-500/15 text-[11px] font-semibold text-amber-800 dark:text-amber-200',
        className,
      )}
    >
      {PRIOR_CONNECTION_BADGE_LABEL}
    </FcChip>
  );
}
