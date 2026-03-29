/**
 * Shared `data-chat-hover-anchor` for message column + portaled toolbars/pickers so
 * `mouseleave` → `relatedTarget` can detect moves into sibling portaled UI.
 */
export const CHAT_HOVER_ANCHOR_ATTR = 'data-chat-hover-anchor';

export function pointerMovesWithinHoverGroup(relatedTarget: EventTarget | null, groupId: string): boolean {
  if (!relatedTarget || !(relatedTarget instanceof Element)) return false;
  const anchor = relatedTarget.closest(`[${CHAT_HOVER_ANCHOR_ATTR}]`);
  return anchor?.getAttribute(CHAT_HOVER_ANCHOR_ATTR) === groupId;
}
