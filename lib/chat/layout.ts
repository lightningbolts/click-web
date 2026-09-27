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

/**
 * The open conversation: same plate as [CHAT_PANEL_CLASS] but laid out as a row, so the
 * thread column and the conversation-details column share one border.
 */
export const CHAT_THREAD_PANEL_CLASS =
  "relative flex h-full min-h-0 overflow-hidden rounded-[16px] border border-border-hard bg-surface";
