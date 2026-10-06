import type { ReactNode } from 'react';
import { ClickMark } from '@/components/ds/ClickMark';

/** The centered 400 px auth card (spec §7.11): logo 48, title-2, one line, then the form. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-1 items-start justify-center px-[var(--gutter)] py-10 sm:items-center sm:py-16">
      <div className="w-full max-w-[400px] rounded-xl bg-surface p-6 sm:p-8 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        <ClickMark size={48} />
        <h1 className="type-title-2 mt-5 text-fg">{title}</h1>
        {subtitle ? <p className="type-body mt-1.5 text-fg-secondary">{subtitle}</p> : null}
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </div>
  );
}
