'use client';

import { RetryRow } from '@/components/ds';

/** A failed recruiting load keeps the admin shell and offers a retry, never empty numbers. */
export default function RecruitingError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg bg-surface p-5 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
      <RetryRow thing="applications" onRetry={reset} />
    </div>
  );
}
