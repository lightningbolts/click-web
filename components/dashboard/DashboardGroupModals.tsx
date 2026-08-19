'use client';

import { type Dispatch, type SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { FcTextarea } from '@/components/fc';
import { renameCliqueRpc } from '@/lib/chat/createVerifiedClick';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';

/**
 * Dashboard-level group modals: the verified-clique member picker and the
 * chat-list group rename dialog. Extracted verbatim from DashboardView.
 */
export function DashboardGroupModals({
  showGroupMemberPicker,
  setShowGroupMemberPicker,
  groupMemberPickerRows,
  selectedConnection,
  setSelectedConnection,
  setProfileUserId,
  setProfileConnectionId,
  chatListGroupRenameGroupId,
  setChatListGroupRenameGroupId,
  chatListGroupRenameInput,
  setChatListGroupRenameInput,
  chatListGroupRenameBusy,
  setChatListGroupRenameBusy,
  setGroupClicksReloadNonce,
}: {
  showGroupMemberPicker: boolean;
  setShowGroupMemberPicker: Dispatch<SetStateAction<boolean>>;
  groupMemberPickerRows: { userId: string; label: string }[];
  selectedConnection: ConnectionRecord | null;
  setSelectedConnection: Dispatch<SetStateAction<ConnectionRecord | null>>;
  setProfileUserId: Dispatch<SetStateAction<string | null>>;
  setProfileConnectionId: Dispatch<SetStateAction<string | null>>;
  chatListGroupRenameGroupId: string | null;
  setChatListGroupRenameGroupId: Dispatch<SetStateAction<string | null>>;
  chatListGroupRenameInput: string;
  setChatListGroupRenameInput: Dispatch<SetStateAction<string>>;
  chatListGroupRenameBusy: boolean;
  setChatListGroupRenameBusy: Dispatch<SetStateAction<boolean>>;
  setGroupClicksReloadNonce: Dispatch<SetStateAction<number>>;
}) {
  return (
    <>
      <AnimatePresence>
        {showGroupMemberPicker && groupMemberPickerRows.length > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowGroupMemberPicker(false)}
            role="presentation"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-full max-w-sm rounded-2xl border border-border-hard bg-surface-container p-5 shadow-xl"
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
                  className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface hover:text-on-surface"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="mt-4 max-h-[min(50vh,280px)] space-y-1 overflow-y-auto pr-1">
                {groupMemberPickerRows.map((row) => (
                  <li key={row.userId}>
                    <button
                      type="button"
                      className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-on-surface hover:bg-surface"
                      onClick={() => {
                        setProfileConnectionId(selectedConnection?.id ?? null);
                        setProfileUserId(row.userId);
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
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {chatListGroupRenameGroupId ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            onClick={() => {
              if (chatListGroupRenameBusy) return;
              setChatListGroupRenameGroupId(null);
            }}
            role="presentation"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-full max-w-sm rounded-2xl border border-border-hard bg-surface-container p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-on-surface">Edit group name</h3>
              <FcTextarea
                value={chatListGroupRenameInput}
                onChange={(e) => setChatListGroupRenameInput(e.target.value)}
                rows={2}
                className="mt-3 w-full"
                placeholder="Group name"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={chatListGroupRenameBusy}
                  onClick={() => {
                    if (chatListGroupRenameBusy) return;
                    setChatListGroupRenameGroupId(null);
                  }}
                  className="px-3 py-2 rounded-xl border border-border-hard text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!chatListGroupRenameInput.trim() || chatListGroupRenameBusy}
                  onClick={async () => {
                    const gid = chatListGroupRenameGroupId;
                    if (!gid) return;
                    const next = chatListGroupRenameInput.trim();
                    if (!next) return;
                    const supabase = getSupabaseClient();
                    if (!supabase) {
                      window.alert('Sign in required.');
                      return;
                    }
                    setChatListGroupRenameBusy(true);
                    try {
                      await renameCliqueRpc(supabase, gid, next);
                      setSelectedConnection((prev) =>
                        prev?.id === gid ? { ...prev, name: next } : prev,
                      );
                      setChatListGroupRenameGroupId(null);
                      setGroupClicksReloadNonce((n) => n + 1);
                    } catch (e) {
                      window.alert(e instanceof Error ? e.message : 'Could not rename group');
                    } finally {
                      setChatListGroupRenameBusy(false);
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-primary text-on-primary hover:opacity-90 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
