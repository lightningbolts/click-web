/**
 * Shared chat transcript chrome width.
 *
 * Marketing pages use `max-w-5xl` (1024px). The dashboard chat pane is already
 * full-bleed beside the sidebar, so that cap leaves short bubbles floating in a
 * huge column. `max-w-xl` (576px) tracks mobile `ChatBubbleTokens.contentMaxWidth`
 * (~450dp) without looking like a phone screenshot on desktop.
 */
export const CHAT_TRANSCRIPT_MAX_CLASS = 'max-w-xl';
