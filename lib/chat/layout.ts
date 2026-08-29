/**
 * Shared chat transcript chrome width.
 *
 * The dashboard chat pane is already the main column beside the sidebar.
 * Do not cap header / transcript / composer with `max-w-xl` (that leaves a
 * skinny strip and huge gutters). Bubble width stays on `MessageBubble`.
 */
export const CHAT_TRANSCRIPT_MAX_CLASS = 'max-w-none';
