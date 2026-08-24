'use client';

export function ConversationDaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-800 to-zinc-700/80" />
      <span className="rounded-full border border-zinc-700/80 bg-zinc-950/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">
        {label}
      </span>
      <div className="h-px flex-1 bg-gradient-to-r from-zinc-700/80 via-zinc-800 to-transparent" />
    </div>
  );
}
