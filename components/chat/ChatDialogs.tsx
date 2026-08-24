'use client';

import { type Dispatch, type SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { renameCliqueRpc } from '@/lib/chat/createVerifiedClick';

/**
 * ChatView's overlay dialogs: delete-message confirm, report, rename-group,
 * group member picker, and the action toast. Extracted verbatim from ChatView.
 */
export function ChatDialogs({
  connection,
  showDeleteConfirm,
  setShowDeleteConfirm,
  setPendingDeleteMessageId,
  confirmDeleteMessage,
  showReportDialog,
  setShowReportDialog,
  reportReason,
  setReportReason,
  onReport,
  showRenameGroupModal,
  setShowRenameGroupModal,
  renameGroupInput,
  setRenameGroupInput,
  setDisplayGroupName,
  onGroupChatChanged,
  showGroupMemberPicker,
  setShowGroupMemberPicker,
  groupMemberProfileRows,
  onOpenProfile,
  actionToast,
  setActionToast,
}: {
  connection: ConnectionRecord;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: Dispatch<SetStateAction<boolean>>;
  setPendingDeleteMessageId: Dispatch<SetStateAction<string | null>>;
  confirmDeleteMessage: () => Promise<void>;
  showReportDialog: boolean;
  setShowReportDialog: Dispatch<SetStateAction<boolean>>;
  reportReason: string;
  setReportReason: Dispatch<SetStateAction<string>>;
  onReport: (reason: string) => Promise<boolean> | boolean;
  showRenameGroupModal: boolean;
  setShowRenameGroupModal: Dispatch<SetStateAction<boolean>>;
  renameGroupInput: string;
  setRenameGroupInput: Dispatch<SetStateAction<string>>;
  setDisplayGroupName: Dispatch<SetStateAction<string | null>>;
  onGroupChatChanged?: () => void;
  showGroupMemberPicker: boolean;
  setShowGroupMemberPicker: Dispatch<SetStateAction<boolean>>;
  groupMemberProfileRows: { userId: string; label: string }[];
  onOpenProfile?: (userId: string) => void;
  actionToast: { type: 'success' | 'error'; message: string } | null;
  setActionToast: Dispatch<SetStateAction<{ type: 'success' | 'error'; message: string } | null>>;
}) {
  return (
    <>
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 "
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-[92%] max-w-sm rounded-2xl border border-border-hard bg-surface p-5"
            >
              <h3 className="text-base font-semibold text-on-surface">Delete message?</h3>
              <p className="mt-2 text-sm text-on-surface-variant">This message will be removed permanently.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setPendingDeleteMessageId(null);
                  }}
                  className="px-3 py-2 rounded-xl border border-border-hard text-on-surface hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteMessage}
                  className="px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-500"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReportDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 "
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-[92%] max-w-md rounded-2xl border border-border-hard bg-surface p-5"
            >
              <h3 className="text-base font-semibold text-on-surface">Report connection</h3>
              <p className="mt-2 text-sm text-on-surface-variant">Describe what happened. This helps moderation review quickly.</p>
              <textarea
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                rows={4}
                className="mt-3 w-full rounded-xl border border-border-hard bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Reason for report"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowReportDialog(false);
                    setReportReason('');
                  }}
                  className="px-3 py-2 rounded-xl border border-border-hard text-on-surface hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const reason = reportReason.trim();
                    if (!reason) return;
                    if (!window.confirm('Submit this report for moderation review?')) {
                      return;
                    }
                    const success = await onReport(reason);
                    setActionToast(success
                      ? { type: 'success', message: 'Report submitted' }
                      : { type: 'error', message: 'Could not submit report' }
                    );
                    if (success) {
                      setShowReportDialog(false);
                      setReportReason('');
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-amber-600 text-white hover:bg-amber-500"
                >
                  Submit report
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRenameGroupModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 "
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-[92%] max-w-sm rounded-2xl border border-border-hard bg-surface p-5"
            >
              <h3 className="text-base font-semibold text-on-surface">Rename group</h3>
              <textarea
                value={renameGroupInput}
                onChange={(e) => setRenameGroupInput(e.target.value)}
                rows={2}
                className="mt-3 w-full rounded-xl border border-border-hard bg-background px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Group name"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRenameGroupModal(false)}
                  className="px-3 py-2 rounded-xl border border-border-hard text-on-surface hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!renameGroupInput.trim()}
                  onClick={async () => {
                    const supabase = getSupabaseClient();
                    if (!supabase) return;
                    const next = renameGroupInput.trim();
                    if (!next) return;
                    try {
                      await renameCliqueRpc(supabase, connection.id, next);
                      setDisplayGroupName(next);
                      setActionToast({ type: 'success', message: 'Group renamed' });
                      setShowRenameGroupModal(false);
                      onGroupChatChanged?.();
                    } catch (e: unknown) {
                      setActionToast({
                        type: 'error',
                        message: e instanceof Error ? e.message : 'Could not rename group',
                      });
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-primary text-on-primary hover:opacity-90 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGroupMemberPicker && groupMemberProfileRows.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50  p-4"
            onClick={() => setShowGroupMemberPicker(false)}
            role="presentation"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-full max-w-sm rounded-2xl border border-border-hard bg-surface p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-on-surface">Members</h3>
                  <p className="mt-1 text-xs text-on-surface-variant">Choose someone to view their profile.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGroupMemberPicker(false)}
                  className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="mt-4 max-h-[min(50vh,280px)] space-y-1 overflow-y-auto pr-1">
                {groupMemberProfileRows.map((row) => (
                  <li key={row.userId}>
                    <button
                      type="button"
                      className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-on-surface hover:bg-surface-container"
                      onClick={() => {
                        onOpenProfile?.(row.userId);
                        setShowGroupMemberPicker(false);
                      }}
                    >
                      {row.label}
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {actionToast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div
              className={`rounded-xl border px-4 py-2.5 text-sm shadow-xl  ${
                actionToast.type === 'success'
                  ? 'bg-emerald-600/90 border-emerald-400/40 text-white'
                  : 'bg-red-600/90 border-red-400/40 text-white'
              }`}
            >
              {actionToast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
