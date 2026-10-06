'use client';

import { useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Toggle } from '@/components/ds/Toggle';

/** Inset-grouped list of toggle rows whose explanations wrap (spec §7.8). */
export function ToggleList({ header, footer, children }: { header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <div>
      {header ? <p className="type-meta mb-2 px-4 font-semibold text-fg-secondary">{header}</p> : null}
      <ul className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">{children}</ul>
      {footer ? <p className="type-meta mt-2 px-4 text-fg-tertiary">{footer}</p> : null}
    </div>
  );
}

export function ToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <li className="flex items-center gap-3 px-4 py-3 shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
      {Icon ? <Icon size={20} strokeWidth={1.75} aria-hidden className="w-7 shrink-0 text-fg-secondary" /> : null}
      <span className="min-w-0 flex-1">
        <span id={`${id}-t`} className="type-body block text-fg">
          {title}
        </span>
        {description ? (
          <span id={`${id}-d`} className="type-meta block text-fg-tertiary">
            {description}
          </span>
        ) : null}
      </span>
      <Toggle
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-labelledby={`${id}-t`}
        aria-describedby={description ? `${id}-d` : undefined}
      />
    </li>
  );
}
