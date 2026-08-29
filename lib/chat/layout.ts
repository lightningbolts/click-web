/**
 * Shared chat transcript chrome width.
 *
 * Match Navbar / event pages (`max-w-6xl`). Edge-to-edge bubbles on a wide
 * pane leave a hole in the middle; `max-w-xl` was too skinny. Bubble width
 * still lives on `MessageBubble`.
 */
import { PAGE_COLUMN_MAX_CLASS } from "@/lib/shell/pageColumn";

export const CHAT_TRANSCRIPT_MAX_CLASS = PAGE_COLUMN_MAX_CLASS;
