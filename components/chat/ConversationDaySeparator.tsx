'use client';

export function ConversationDaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border-hard to-border-hard" />
      <span className="rounded-full border border-border-hard bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-on-surface-variant">
        {label}
      </span>
      <div className="h-px flex-1 bg-gradient-to-r from-border-hard via-border-hard to-transparent" />
    </div>
  );
}
