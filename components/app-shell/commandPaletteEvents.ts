/** The command palette (spec §7.10) listens for this; anything can open it. */
export const COMMAND_PALETTE_EVENT = 'click:command-palette';

export function openCommandPalette() {
  window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT));
}
