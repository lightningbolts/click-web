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
  Phone,
  Video,
  Pencil,
  LogOut,
  Trash2,
} from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { ConnectionPeerAvatar } from '@/components/dashboard/ConnectionPeerAvatar';
import { deleteCliqueRpc, leaveCliqueRpc } from '@/lib/chat/createVerifiedClick';
import { CHAT_TRANSCRIPT_MAX_CLASS } from '@/lib/chat/layout';

/**
 * Chat header: back button, avatar/profile entry, title, status badge, and
 * the call + actions menus (portaled, with their own positioning state).
 * Extracted verbatim from ChatView.
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
  onStartCall,
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
  onStartCall: (videoEnabled: boolean) => void;
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
  const [showCallMenu, setShowCallMenu] = useState(false);
  const [groupMenuBusy, setGroupMenuBusy] = useState(false);
  const callMenuAnchorRef = useRef<HTMLDivElement>(null);
  const headerMenuAnchorRef = useRef<HTMLDivElement>(null);
  const [callMenuPos, setCallMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [headerMenuPos, setHeaderMenuPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!showCallMenu || typeof document === 'undefined') {
      setCallMenuPos(null);
      return;
    }
    const place = () => {
      const el = callMenuAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const menuW = 200;
      setCallMenuPos({
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
  }, [showCallMenu]);

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
    <div className={`relative z-50 mx-auto mb-3 mt-4 w-[calc(100%-2rem)] ${CHAT_TRANSCRIPT_MAX_CLASS} shrink-0 overflow-visible rounded-[16px] border border-border-hard bg-surface pt-[env(safe-area-inset-top,0px)] shadow-sm md:w-[calc(100%-3rem)]`}>
      {isGroupClique && groupKeyError ? (
        <div className="mx-4 mt-3 rounded-[8px] border-2 border-amber-600/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-100">
          {groupKeyError}
        </div>
      ) : null}
      <div className="flex items-center gap-4 px-5 py-4">
        <button
          onClick={onClose}
          className="rounded-[8px] p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" /> {connection.location}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3 shrink-0" /> {metDate}
              </span>
            </div>
          )}
        </div>

        {/* Connection / clique status badge */}
        <div
          className={`hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium sm:flex ${
            isGroupClique
              ? 'border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
              : 'border-primary/25 bg-on-primary-container text-primary'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full animate-pulse ${
              isGroupClique ? 'bg-emerald-400' : 'bg-primary'
            }`}
          />
          {isGroupClique ? 'Verified clique' : 'Connected'}
        </div>

        <div className="relative" ref={callMenuAnchorRef}>
            <button
              onClick={() => {
                setShowCallMenu((prev) => !prev);
                setShowHeaderMenu(false);
              }}
              className="rounded-[8px] p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              aria-label="Call options"
            >
              <Phone className="w-5 h-5" />
            </button>

            {showCallMenu &&
              callMenuPos &&
              typeof document !== 'undefined' &&
              createPortal(
                <>
                  <button
                    type="button"
                    aria-label="Dismiss menu"
                    className="fixed inset-0 z-[240] cursor-default bg-transparent"
                    onClick={() => setShowCallMenu(false)}
                  />
                  <div
                    className="fixed z-[250] min-w-[180px] rounded-[1.4rem] border border-border-hard bg-surface shadow-2xl overflow-hidden"
                    style={{ top: callMenuPos.top, left: callMenuPos.left }}
                  >
                    <button
                      onClick={() => {
                        setShowCallMenu(false);
                        onStartCall(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-on-surface hover:bg-surface-container"
                    >
                      <Phone className="h-4 w-4" />
                      {isGroupClique ? 'Group voice call' : 'Voice call'}
                    </button>
                    <button
                      onClick={() => {
                        setShowCallMenu(false);
                        onStartCall(true);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-on-surface hover:bg-surface-container"
                    >
                      <Video className="h-4 w-4" />
                      {isGroupClique ? 'Group video call' : 'Video call'}
                    </button>
                  </div>
                </>,
                document.body,
              )}
          </div>

        <div className="relative" ref={headerMenuAnchorRef}>
          <button
            type="button"
            onClick={() => {
              setShowHeaderMenu((prev) => !prev);
              setShowCallMenu(false);
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
                          className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-surface-container flex items-center gap-2 disabled:opacity-40"
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
                        className="w-full text-left px-3 py-2 text-sm text-amber-300 hover:bg-surface-container flex items-center gap-2"
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
                          className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-surface-container flex items-center gap-2"
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
                        className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-surface-container flex items-center gap-2"
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
