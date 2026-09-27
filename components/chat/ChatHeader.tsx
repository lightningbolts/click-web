'use client';

import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Star,
  MoreHorizontal,
  Archive,
  UserMinus,
  Users,
  Flag,
  Shield,
  ShieldOff,
  BellOff,
  PanelRight,
  Pencil,
  LogOut,
  Trash2,
} from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { ConnectionPeerAvatar } from '@/components/dashboard/ConnectionPeerAvatar';
import { deleteCliqueRpc, leaveCliqueRpc } from '@/lib/chat/createVerifiedClick';

/**
 * Chat header: back button (narrow layouts), avatar/profile entry, title, status badge,
 * the details-panel toggle, and the actions menu. Voice/video controls were removed from the
 * web product; the LiveKit/API support stays in place (see `useDashboardCalls`, `CallOverlay`).
 */
export function ChatHeader({
  connection,
  currentUserId,
  isGroupClique,
  otherUserName,
  headerTitle,
  metDate,
  peerUserId,
  peerIsOnline,
  groupKeyError,
  groupHeaderSubtitle,
  groupCreatorId,
  groupMemberProfileRows,
  isCore,
  isArchived,
  isBlocked,
  onClose,
  onOpenProfile,
  muted,
  detailsOpen,
  onToggleDetails,
  onGroupChatChanged,
  onAddToCore,
  onRemoveFromCore,
  onArchive,
  onUnarchive,
  onRemove,
  onBlock,
  onUnblock,
  setActionToast,
  setShowReportDialog,
  setShowGroupMemberPicker,
  openRenameGroupModal,
}: {
  connection: ConnectionRecord;
  currentUserId: string;
  isGroupClique: boolean;
  otherUserName: string;
  headerTitle: string;
  metDate: string;
  peerUserId: string | undefined;
  peerIsOnline: boolean;
  groupKeyError: string | null;
  groupHeaderSubtitle: string | null;
  groupCreatorId: string | null;
  groupMemberProfileRows: { userId: string; label: string }[];
  isCore: boolean;
  isArchived: boolean;
  isBlocked: boolean;
  onClose: () => void;
  onOpenProfile?: (userId: string) => void;
  muted: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onGroupChatChanged?: () => void;
  onAddToCore?: () => Promise<boolean> | boolean;
  onRemoveFromCore?: () => Promise<boolean> | boolean;
  onArchive: () => Promise<boolean> | boolean;
  onUnarchive: () => Promise<boolean> | boolean;
  onRemove: () => Promise<boolean> | boolean;
  onBlock: () => Promise<boolean> | boolean;
  onUnblock: () => Promise<boolean> | boolean;
  setActionToast: Dispatch<SetStateAction<{ type: 'success' | 'error'; message: string } | null>>;
  setShowReportDialog: Dispatch<SetStateAction<boolean>>;
  setShowGroupMemberPicker: Dispatch<SetStateAction<boolean>>;
  openRenameGroupModal: (currentTitle: string) => void;
}) {
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [groupMenuBusy, setGroupMenuBusy] = useState(false);
  const headerMenuAnchorRef = useRef<HTMLDivElement>(null);
  const [headerMenuPos, setHeaderMenuPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!showHeaderMenu || typeof document === 'undefined') {
      setHeaderMenuPos(null);
      return;
    }
    const place = () => {
      const el = headerMenuAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const menuW = 200;
      setHeaderMenuPos({
        top: r.bottom + 8,
        left: Math.min(r.right - menuW, window.innerWidth - menuW - 12),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [showHeaderMenu]);

  return (
    <div className="relative z-50 shrink-0 overflow-visible border-b border-border-hard bg-surface pt-[env(safe-area-inset-top,0px)]">
      {isGroupClique && groupKeyError ? (
        <div className="mx-4 mt-3 rounded-[8px] border-2 border-amber-600/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-100">
          {groupKeyError}
        </div>
      ) : null}
      <div className="flex items-center gap-3 px-4 py-3 md:gap-4 md:px-5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-[8px] p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface md:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <button
          type="button"
          className="relative shrink-0 rounded-full border-0 bg-transparent p-0 cursor-pointer"
          onClick={() => {
            if (isGroupClique) {
              if (onOpenProfile && groupMemberProfileRows.length > 0) {
                setShowGroupMemberPicker(true);
              }
            } else if (peerUserId && onOpenProfile) {
              onOpenProfile(peerUserId);
            }
          }}
          disabled={
            isGroupClique
              ? !onOpenProfile || groupMemberProfileRows.length === 0
              : !peerUserId || !onOpenProfile
          }
          aria-label={isGroupClique ? 'View members' : 'View profile'}
        >
          {isGroupClique ? (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-bold ">
              <Users className="h-5 w-5 text-on-primary" aria-hidden />
            </div>
          ) : (
            <ConnectionPeerAvatar
              label={otherUserName}
              imageUrl={connection.avatarUrl}
              size="lg"
              showOnline={peerIsOnline}
            />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="min-w-0 truncate text-lg font-semibold text-on-surface">{headerTitle}</p>
            {isGroupClique ? (
              <button
                type="button"
                onClick={() => {
                  openRenameGroupModal(headerTitle);
                }}
                className="shrink-0 rounded-[8px] p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                aria-label="Rename group"
              >
                <Pencil className="w-4 h-4" />
              </button>
            ) : null}
          </div>
          {isGroupClique && groupHeaderSubtitle ? (
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-on-surface-variant">{groupHeaderSubtitle}</p>
          ) : (
            <div className="flex min-w-0 items-center gap-x-3 text-xs text-on-surface-variant">
              <span className="flex min-w-0 items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate" title={connection.location}>{connection.location}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
                <Calendar className="h-3 w-3 shrink-0" /> {metDate}
              </span>
            </div>
          )}
        </div>

        {muted ? (
          <span className="hidden items-center text-on-surface-variant sm:inline-flex" title="Notifications muted">
            <BellOff className="h-4 w-4" aria-label="Notifications muted" />
          </span>
        ) : null}

        <button
          type="button"
          onClick={onToggleDetails}
          aria-pressed={detailsOpen}
          aria-controls="conversation-details"
          className={`rounded-[8px] p-2 transition-colors ${
            detailsOpen
              ? 'bg-primary-container text-on-primary-container'
              : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
          }`}
          aria-label={detailsOpen ? 'Hide conversation details' : 'Show conversation details'}
          title="Details"
        >
          <PanelRight className="h-5 w-5" />
        </button>

        <div className="relative" ref={headerMenuAnchorRef}>
          <button
            type="button"
            onClick={() => {
              setShowHeaderMenu((prev) => !prev);
            }}
            className="rounded-[8px] p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            aria-label="Chat actions"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {showHeaderMenu &&
            headerMenuPos &&
            typeof document !== 'undefined' &&
            createPortal(
              <>
                <button
                  type="button"
                  aria-label="Dismiss menu"
                  className="fixed inset-0 z-[240] cursor-default bg-transparent"
                  onClick={() => setShowHeaderMenu(false)}
                />
                <div
                  className="fixed z-[250] min-w-[180px] rounded-xl border border-border-hard bg-surface shadow-xl overflow-hidden"
                  style={{ top: headerMenuPos.top, left: headerMenuPos.left }}
                >
                  {isGroupClique ? (
                    <>
                      <button
                        type="button"
                        disabled={groupMenuBusy}
                        onClick={async () => {
                          if (!window.confirm('Leave this verified click? You can rejoin only if someone adds you again.')) {
                            setShowHeaderMenu(false);
                            return;
                          }
                          const supabase = getSupabaseClient();
                          if (!supabase) return;
                          setGroupMenuBusy(true);
                          try {
                            await leaveCliqueRpc(supabase, connection.id);
                            setActionToast({ type: 'success', message: 'You left the group' });
                            setShowHeaderMenu(false);
                            onGroupChatChanged?.();
                            setTimeout(() => onClose(), 400);
                          } catch (e: unknown) {
                            setActionToast({
                              type: 'error',
                              message: e instanceof Error ? e.message : 'Could not leave group',
                            });
                          } finally {
                            setGroupMenuBusy(false);
                          }
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container flex items-center gap-2 disabled:opacity-40"
                      >
                        <LogOut className="w-4 h-4" /> Leave group
                      </button>
                      {groupCreatorId === currentUserId ? (
                        <button
                          type="button"
                          disabled={groupMenuBusy}
                          onClick={async () => {
                            if (!window.confirm('Permanently delete this verified click for everyone?')) {
                              setShowHeaderMenu(false);
                              return;
                            }
                            const supabase = getSupabaseClient();
                            if (!supabase) return;
                            setGroupMenuBusy(true);
                            try {
                              await deleteCliqueRpc(supabase, connection.id);
                              setActionToast({ type: 'success', message: 'Group deleted' });
                              setShowHeaderMenu(false);
                              onGroupChatChanged?.();
                              setTimeout(() => onClose(), 400);
                            } catch (e: unknown) {
                              setActionToast({
                                type: 'error',
                                message: e instanceof Error ? e.message : 'Could not delete group',
                              });
                            } finally {
                              setGroupMenuBusy(false);
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-error hover:bg-surface-container flex items-center gap-2 disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" /> Delete group
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {isCore && onRemoveFromCore ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const success = await onRemoveFromCore();
                            setActionToast(success
                              ? { type: 'success', message: 'Removed from Core' }
                              : { type: 'error', message: 'Could not update Core list' }
                            );
                            setShowHeaderMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-container flex items-center gap-2"
                        >
                          <Star className="w-4 h-4" /> Remove from Core
                        </button>
                      ) : onAddToCore ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const success = await onAddToCore();
                            setActionToast(success
                              ? { type: 'success', message: 'Added to Core' }
                              : { type: 'error', message: 'Could not update Core list' }
                            );
                            setShowHeaderMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-container flex items-center gap-2"
                        >
                          <Star className="w-4 h-4" /> Add to Core
                        </button>
                      ) : null}

                      {isArchived ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const success = await onUnarchive();
                            const restored = connection.status === 'archived';
                            setActionToast(success
                              ? {
                                  type: 'success',
                                  message: restored ? 'Connection restored to active' : 'Conversation unarchived',
                                }
                              : {
                                  type: 'error',
                                  message: restored
                                    ? 'Could not restore connection'
                                    : 'Could not unarchive conversation',
                                }
                            );
                            setShowHeaderMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-container"
                        >
                          {connection.status === 'archived' ? 'Restore' : 'Unarchive'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            const success = await onArchive();
                            setActionToast(success
                              ? { type: 'success', message: 'Conversation archived' }
                              : { type: 'error', message: 'Could not archive conversation' }
                            );
                            setShowHeaderMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container flex items-center gap-2"
                        >
                          <Archive className="w-4 h-4" /> Archive
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => { setShowReportDialog(true); setShowHeaderMenu(false); }}
                        className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container flex items-center gap-2"
                      >
                        <Flag className="w-4 h-4" /> Report
                      </button>

                      {isBlocked ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const success = await onUnblock();
                            setActionToast(success
                              ? { type: 'success', message: 'User unblocked' }
                              : { type: 'error', message: 'Could not unblock user' }
                            );
                            setShowHeaderMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface-container flex items-center gap-2"
                        >
                          <ShieldOff className="w-4 h-4" /> Unblock
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(`Block ${otherUserName} and remove this connection?`)) {
                              setShowHeaderMenu(false);
                              return;
                            }
                            const success = await onBlock();
                            setActionToast(success
                              ? { type: 'success', message: 'User blocked and connection removed' }
                              : { type: 'error', message: 'Could not block user' }
                            );
                            if (success) {
                              setTimeout(() => onClose(), 700);
                            }
                            setShowHeaderMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-error hover:bg-surface-container flex items-center gap-2"
                        >
                          <Shield className="w-4 h-4" /> Block
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={async () => {
                          setShowHeaderMenu(false);
                          if (!window.confirm(`Remove your connection with ${otherUserName}?`)) {
                            return;
                          }
                          const success = await onRemove();
                          setActionToast(success
                            ? { type: 'success', message: 'Connection removed' }
                            : { type: 'error', message: 'Could not remove connection' }
                          );
                          if (success) {
                            setTimeout(() => onClose(), 700);
                          }
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-error hover:bg-surface-container flex items-center gap-2"
                      >
                        <UserMinus className="w-4 h-4" /> Remove connection
                      </button>
                    </>
                  )}
                </div>
              </>,
              document.body,
            )}
        </div>
      </div>
    </div>
  );
}
