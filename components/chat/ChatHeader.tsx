'use client';

import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  BellOff,
  CalendarPlus,
  Flag,
  LogOut,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Search,
  Shield,
  ShieldOff,
  Star,
  StarOff,
  Trash2,
  User,
  UserMinus,
  Users,
} from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { IconButton } from '@/components/ds/IconButton';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from '@/components/ds/Menu';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { MUTE_OPTIONS, type ChatMute } from '@/lib/chat/conversationApi';
import { cn } from '@/lib/cn';
import type { ChatDialogState } from './ChatDialogs';
import { chatNotify } from './chatNotify';
import type { ConversationActions } from './useConversationActions';

/**
 * Thread header (spec §7.2): back on narrow screens, who you're talking to and their status,
 * then search, the details toggle and the conversation menu. No call buttons: voice and video
 * are app-only.
 */
export function ChatHeader({
  connection,
  isGroupClique,
  title,
  peerUserId,
  peerIsOnline,
  typing,
  subtitle,
  isCore,
  isArchived,
  isBlocked,
  mute,
  onSetMuted,
  detailsOpen,
  onToggleDetails,
  searchOpen,
  onToggleSearch,
  onPlan,
  onClose,
  onOpenProfile,
  openDialog,
  actions,
}: {
  connection: ConnectionRecord;
  isGroupClique: boolean;
  title: string;
  peerUserId: string | undefined;
  peerIsOnline: boolean;
  typing: boolean;
  /** Tertiary status when nobody is typing or online ("Met at …", "{N} members"). */
  subtitle: string;
  isCore: boolean;
  isArchived: boolean;
  isBlocked: boolean;
  mute: ChatMute | null;
  onSetMuted: (muted: boolean, durationMs: number | null) => Promise<void>;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  onPlan: () => void;
  onClose: () => void;
  onOpenProfile?: (userId: string) => void;
  openDialog: (state: ChatDialogState) => void;
  actions: ConversationActions;
}) {
  const status = typing ? (
    <span className="text-accent">typing…</span>
  ) : !isGroupClique && peerIsOnline ? (
    <span className="text-online-text">Online</span>
  ) : (
    <span className="text-fg-tertiary">{subtitle}</span>
  );

  const setMute = async (muted: boolean, ms: number | null) => {
    try {
      await onSetMuted(muted, ms);
      chatNotify({ type: 'success', message: muted ? 'Notifications muted' : 'Notifications on' });
    } catch {
      chatNotify({ type: 'error', message: 'Couldn’t change notifications. Try again.' });
    }
  };

  return (
    <header className="material-glass relative z-20 flex h-16 shrink-0 items-center gap-2 border-b border-hairline px-3 pt-[env(safe-area-inset-top,0px)] md:px-4">
      <IconButton icon={ArrowLeft} aria-label="Back to conversations" className="md:hidden" onClick={onClose} />

      <button
        type="button"
        onClick={onToggleDetails}
        aria-controls="conversation-details"
        aria-expanded={detailsOpen}
        className="press flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 pr-2 text-left"
      >
        {isGroupClique ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-selection text-accent">
            <Users size={20} aria-hidden />
          </span>
        ) : (
          <Avatar seed={peerUserId ?? connection.id} name={title} src={connection.avatarUrl} size={40} presence={peerIsOnline} />
        )}
        <span className="min-w-0">
          <span className="type-body-strong block truncate text-fg">{title}</span>
          <span className="type-meta block truncate" aria-live="polite">
            {status}
          </span>
        </span>
      </button>

      {mute ? <BellOff size={16} className="hidden shrink-0 text-fg-tertiary sm:block" aria-label="Notifications muted" /> : null}
      <IconButton icon={Search} aria-label="Search in conversation" aria-pressed={searchOpen} onClick={onToggleSearch} className={cn(searchOpen && 'bg-selection text-accent')} />
      <IconButton
        icon={PanelRight}
        aria-label={detailsOpen ? 'Hide details' : 'Show details'}
        aria-pressed={detailsOpen}
        aria-controls="conversation-details"
        onClick={onToggleDetails}
        className={cn('max-sm:hidden', detailsOpen && 'bg-selection text-accent')}
      />

      <Menu>
        <MenuTrigger asChild>
          <IconButton icon={MoreHorizontal} aria-label="Conversation actions" disabled={actions.busy} />
        </MenuTrigger>
        <MenuContent className="min-w-56">
          <MenuItem icon={Search} onSelect={onToggleSearch}>
            Search
          </MenuItem>
          <MenuItem icon={CalendarPlus} onSelect={onPlan}>
            Plan a hangout
          </MenuItem>
          {mute ? (
            <MenuItem icon={Bell} onSelect={() => void setMute(false, null)}>
              Unmute
            </MenuItem>
          ) : (
            <MenuSub>
              <MenuSubTrigger icon={BellOff}>Mute</MenuSubTrigger>
              <MenuSubContent>
                {MUTE_OPTIONS.map((o) => (
                  <MenuItem key={o.label} onSelect={() => void setMute(true, o.ms)}>
                    {o.label}
                  </MenuItem>
                ))}
              </MenuSubContent>
            </MenuSub>
          )}

          {isGroupClique ? (
            <>
              <MenuItem icon={Users} onSelect={() => openDialog({ kind: 'members' })}>
                Members
              </MenuItem>
              <MenuItem icon={Pencil} onSelect={() => openDialog({ kind: 'rename', current: title })}>
                Rename group
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={LogOut} destructive onSelect={actions.leaveGroup}>
                Leave group
              </MenuItem>
              {actions.canDeleteGroup ? (
                <MenuItem icon={Trash2} destructive onSelect={actions.deleteGroup}>
                  Delete group
                </MenuItem>
              ) : null}
            </>
          ) : (
            <>
              {peerUserId && onOpenProfile ? (
                <MenuItem icon={User} onSelect={() => onOpenProfile(peerUserId)}>
                  View profile
                </MenuItem>
              ) : null}
              {isCore && actions.removeFromCore ? (
                <MenuItem icon={StarOff} onSelect={actions.removeFromCore}>
                  Remove from Core
                </MenuItem>
              ) : !isCore && actions.addToCore ? (
                <MenuItem icon={Star} onSelect={actions.addToCore}>
                  Add to Core
                </MenuItem>
              ) : null}
              {isArchived ? (
                <MenuItem icon={ArchiveRestore} onSelect={actions.unarchive}>
                  {actions.unarchiveLabel}
                </MenuItem>
              ) : (
                <MenuItem icon={Archive} onSelect={actions.archive}>
                  Archive
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem icon={Flag} destructive onSelect={() => openDialog({ kind: 'report' })}>
                Report…
              </MenuItem>
              {isBlocked ? (
                <MenuItem icon={ShieldOff} onSelect={actions.unblock}>
                  Unblock
                </MenuItem>
              ) : (
                <MenuItem icon={Shield} destructive onSelect={() => void actions.block()}>
                  Block…
                </MenuItem>
              )}
              <MenuItem icon={UserMinus} destructive onSelect={() => void actions.remove()}>
                Remove connection…
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
    </header>
  );
}
