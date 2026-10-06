'use client';

import { Copy, Download, MoreHorizontal, Pencil, Pin, PinOff, Plus, Reply, Trash2 } from 'lucide-react';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ds/Menu';
import { cn } from '@/lib/cn';
import { EmojiPopover } from './EmojiPopover';
import { QUICK_REACTIONS } from './messageMeta';

const barButton =
  'press flex size-8 shrink-0 items-center justify-center rounded-full text-fg-secondary transition-colors duration-[var(--d-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/**
 * The bar shown over a message while it's hovered or focused (spec §7.2): six quick reactions, the
 * full picker, Reply, and a menu with everything else. Right-click and `.` open the same menu.
 */
export function MessageActionBar({
  mine,
  myReactions,
  onReact,
  onReply,
  onCopy,
  onEdit,
  pinned,
  onTogglePin,
  onSaveImage,
  onDelete,
  menuOpen,
  onMenuOpenChange,
  pickerOpen,
  onPickerOpenChange,
}: {
  mine: boolean;
  myReactions: ReadonlySet<string>;
  onReact: (emoji: string) => void;
  onReply?: () => void;
  onCopy?: () => void;
  onEdit?: () => void;
  pinned: boolean;
  onTogglePin?: () => void;
  onSaveImage?: () => void;
  onDelete?: () => void;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Message actions"
      className={cn(
        'absolute -top-10 z-10 flex h-9 items-center gap-0.5 rounded-pill bg-bg-elevated px-1 shadow-overlay',
        mine ? 'right-0' : 'left-0',
      )}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`React ${emoji}`}
          aria-pressed={myReactions.has(emoji)}
          onClick={() => onReact(emoji)}
          className={cn(barButton, 'text-[20px] leading-none', myReactions.has(emoji) && 'bg-selection')}
        >
          {emoji}
        </button>
      ))}
      <EmojiPopover open={pickerOpen} onOpenChange={onPickerOpenChange} onSelect={onReact}>
        <button type="button" aria-label="More reactions" className={barButton}>
          <Plus size={16} aria-hidden />
        </button>
      </EmojiPopover>
      <span aria-hidden className="mx-0.5 h-5 w-px bg-hairline" />
      {onReply ? (
        <button type="button" aria-label="Reply" onClick={onReply} className={barButton}>
          <Reply size={16} aria-hidden />
        </button>
      ) : null}
      <Menu open={menuOpen} onOpenChange={onMenuOpenChange}>
        <MenuTrigger asChild>
          <button type="button" aria-label="More actions" className={barButton}>
            <MoreHorizontal size={16} aria-hidden />
          </button>
        </MenuTrigger>
        <MenuContent align={mine ? 'end' : 'start'} className="min-w-48">
          {onReply ? (
            <MenuItem icon={Reply} onSelect={onReply}>
              Reply
            </MenuItem>
          ) : null}
          {onCopy ? (
            <MenuItem icon={Copy} onSelect={onCopy}>
              Copy text
            </MenuItem>
          ) : null}
          {onEdit ? (
            <MenuItem icon={Pencil} onSelect={onEdit}>
              Edit
            </MenuItem>
          ) : null}
          {onTogglePin ? (
            <MenuItem icon={pinned ? PinOff : Pin} onSelect={onTogglePin}>
              {pinned ? 'Unpin' : 'Pin'}
            </MenuItem>
          ) : null}
          {onSaveImage ? (
            <MenuItem icon={Download} onSelect={onSaveImage}>
              Save image
            </MenuItem>
          ) : null}
          {onDelete ? (
            <>
              <MenuSeparator />
              <MenuItem icon={Trash2} destructive onSelect={onDelete}>
                Delete…
              </MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>
    </div>
  );
}
