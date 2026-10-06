'use client';

/** Day capsule between messages (spec §7.2); it sticks to the top while that day scrolls by. */
export function ConversationDaySeparator({ label }: { label: string }) {
  return (
    <div role="separator" aria-label={label} className="sticky top-2 z-[2] flex justify-center py-3">
      <span className="type-badge rounded-pill bg-surface px-2.5 py-1 text-fg-secondary shadow-overlay">{label}</span>
    </div>
  );
}

/** "New messages" rule above the first message that arrived while you were away. */
export function NewMessagesSeparator() {
  return (
    <div role="separator" aria-label="New messages" className="flex items-center gap-3 py-3">
      <span aria-hidden className="h-px flex-1 bg-accent/40" />
      <span className="type-badge font-semibold text-accent">New messages</span>
      <span aria-hidden className="h-px flex-1 bg-accent/40" />
    </div>
  );
}
