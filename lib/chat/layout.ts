/**
 * Chat sits in the shared page column (`PAGE_COLUMN_CLASS` on the dashboard
 * pane). The thread itself is one bordered card so header, messages, and
 * composer share edges and 16px corners — same as Memory Box cards.
 *
     * Do not pin bubbles edge-to-edge or in a skinny column.
     * Bubble width still lives on `MessageBubble`.
 */
export const CHAT_PANEL_CLASS =
  "flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border border-border-hard bg-surface";
