'use client';

import { useState } from 'react';
import { useConfirm } from '@/components/ds/ConfirmDialog';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { deleteCliqueRpc, leaveCliqueRpc } from '@/lib/chat/createVerifiedClick';
import { getSupabaseClient } from '@/lib/supabase';
import { chatNotify } from './chatNotify';

export type Outcome = () => Promise<boolean> | boolean;

async function report(run: Outcome, ok: string, fail: string): Promise<boolean> {
  let success = false;
  try {
    success = await run();
  } catch {
    success = false;
  }
  chatNotify(success ? { type: 'success', message: ok } : { type: 'error', message: fail });
  return success;
}

export type ConversationActions = ReturnType<typeof useConversationActions>;

/**
 * The conversation-level actions shared by the header menu and the details panel, with their
 * confirmations and toasts in one place. Render `confirmNode` once.
 */
export function useConversationActions({
  connection,
  title,
  isGroupCreator = false,
  onClose,
  onGroupChatChanged,
  onAddToCore,
  onRemoveFromCore,
  onArchive,
  onUnarchive,
  onRemove,
  onBlock,
  onUnblock,
}: {
  connection: ConnectionRecord;
  title: string;
  isGroupCreator?: boolean;
  onClose: () => void;
  onGroupChatChanged?: () => void;
  onAddToCore?: Outcome;
  onRemoveFromCore?: Outcome;
  onArchive: Outcome;
  onUnarchive: Outcome;
  onRemove: Outcome;
  onBlock: Outcome;
  onUnblock: Outcome;
}) {
  const [confirm, confirmNode] = useConfirm();
  const [busy, setBusy] = useState(false);
  const firstName = title.split(/\s+/)[0] || title;
  const restoring = connection.status === 'archived';

  const groupAction = async (kind: 'leave' | 'delete') => {
    const ok = await confirm(
      kind === 'leave'
        ? {
            title: `Leave ${title}?`,
            message: 'You’ll stop getting messages. Someone in the group can add you again.',
            confirmLabel: 'Leave group',
            destructive: true,
          }
        : {
            title: `Delete ${title}?`,
            message: 'The group and its messages are deleted for everyone.',
            confirmLabel: 'Delete group',
            destructive: true,
          },
    );
    const supabase = getSupabaseClient();
    if (!ok || !supabase) return;
    setBusy(true);
    try {
      if (kind === 'leave') await leaveCliqueRpc(supabase, connection.id);
      else await deleteCliqueRpc(supabase, connection.id);
      chatNotify({ type: 'success', message: kind === 'leave' ? 'You left the group' : 'Group deleted' });
      onGroupChatChanged?.();
      onClose();
    } catch (e) {
      chatNotify({ type: 'error', message: e instanceof Error ? e.message : 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    confirmNode,
    leaveGroup: () => void groupAction('leave'),
    canDeleteGroup: isGroupCreator,
    deleteGroup: () => void groupAction('delete'),
    addToCore: onAddToCore ? () => void report(onAddToCore, 'Added to Core', 'Couldn’t update Core. Try again.') : undefined,
    removeFromCore: onRemoveFromCore
      ? () => void report(onRemoveFromCore, 'Removed from Core', 'Couldn’t update Core. Try again.')
      : undefined,
    archive: () => void report(onArchive, 'Archived', 'Couldn’t archive. Try again.'),
    unarchive: () => void report(onUnarchive, restoring ? 'Restored to Active' : 'Unarchived', 'Couldn’t unarchive. Try again.'),
    unarchiveLabel: restoring ? 'Restore' : 'Unarchive',
    unblock: () => void report(onUnblock, `${firstName} is unblocked`, 'Couldn’t unblock. Try again.'),
    block: async () => {
      const ok = await confirm({
        title: `Block ${firstName}?`,
        message: 'They won’t be able to message you, and this connection is removed.',
        confirmLabel: 'Block',
        destructive: true,
      });
      if (ok && (await report(onBlock, `${firstName} is blocked`, 'Couldn’t block. Try again.'))) onClose();
    },
    remove: async () => {
      const ok = await confirm({
        title: `Remove ${firstName}?`,
        message: 'Your conversation and shared history go away for both of you.',
        confirmLabel: 'Remove',
        destructive: true,
      });
      if (ok && (await report(onRemove, 'Connection removed', 'Couldn’t remove. Try again.'))) onClose();
    },
  };
}
