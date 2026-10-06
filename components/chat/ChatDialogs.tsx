'use client';

import { useState } from 'react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { ConfirmDialog } from '@/components/ds/ConfirmDialog';
import { Dialog, DialogClose } from '@/components/ds/Dialog';
import { TextField } from '@/components/ds/TextField';
import { ReportDialog } from '@/components/clicks/ClickDialogs';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { renameCliqueRpc } from '@/lib/chat/createVerifiedClick';
import { getSupabaseClient } from '@/lib/supabase';
import { chatNotify } from './chatNotify';

export type ChatDialogState =
  | { kind: 'delete-message'; messageId: string }
  | { kind: 'report' }
  | { kind: 'rename'; current: string }
  | { kind: 'members' }
  | null;

function RenameGroupDialog({
  connectionId,
  current,
  onClose,
  onRenamed,
}: {
  connectionId: string;
  current: string;
  onClose: () => void;
  onRenamed: (name: string) => void;
}) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = name.trim();

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !next) return;
    setBusy(true);
    setError('');
    try {
      await renameCliqueRpc(supabase, connectionId, next);
      onRenamed(next);
      chatNotify({ type: 'success', message: 'Group renamed' });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t rename the group.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title="Rename group"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button loading={busy} disabled={!next || next === current} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField
          label="Group name"
          hideLabel
          autoFocus
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error || undefined}
        />
      </form>
    </Dialog>
  );
}

/**
 * The thread's dialogs (spec §7.2): delete-message confirm, report, rename group and the
 * member list. One at a time, driven by `state`.
 */
export function ChatDialogs({
  state,
  onClose,
  connection,
  otherUserName,
  onConfirmDeleteMessage,
  onReport,
  onRenamed,
  onGroupChatChanged,
  members,
  onOpenProfile,
}: {
  state: ChatDialogState;
  onClose: () => void;
  connection: ConnectionRecord;
  otherUserName: string;
  onConfirmDeleteMessage: (messageId: string) => Promise<void>;
  onReport: (reason: string) => Promise<boolean> | boolean;
  onRenamed: (name: string) => void;
  onGroupChatChanged?: () => void;
  members: { userId: string; label: string; avatarUrl?: string | null }[];
  onOpenProfile?: (userId: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <>
      <ConfirmDialog
        open={state?.kind === 'delete-message'}
        onOpenChange={(o) => !o && !busy && onClose()}
        title="Delete this message?"
        message="It’s removed for everyone in the conversation."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (state?.kind !== 'delete-message') return;
          setBusy(true);
          try {
            await onConfirmDeleteMessage(state.messageId);
          } finally {
            setBusy(false);
            onClose();
          }
        }}
      />

      <ReportDialog
        name={otherUserName}
        open={state?.kind === 'report'}
        onOpenChange={(o) => !o && onClose()}
        onSubmit={async (reason) => {
          const ok = await onReport(reason);
          if (ok) chatNotify({ type: 'success', message: 'Report sent. Thanks for telling us.' });
          return ok;
        }}
      />

      {state?.kind === 'rename' ? (
        <RenameGroupDialog
          connectionId={connection.id}
          current={state.current}
          onClose={onClose}
          onRenamed={(name) => {
            onRenamed(name);
            onGroupChatChanged?.();
          }}
        />
      ) : null}

      <Dialog
        open={state?.kind === 'members' && members.length > 0}
        onOpenChange={(o) => !o && onClose()}
        title="Members"
        description={`${members.length} ${members.length === 1 ? 'person' : 'people'} in this group`}
      >
        <ul className="-mx-2 max-h-[min(60vh,420px)] overflow-y-auto">
          {members.map((m) => (
            <li key={m.userId}>
              <button
                type="button"
                className="flex min-h-14 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-hover"
                onClick={() => {
                  onClose();
                  onOpenProfile?.(m.userId);
                }}
              >
                <Avatar seed={m.userId} name={m.label} src={m.avatarUrl ?? null} size={40} />
                <span className="type-body-strong min-w-0 flex-1 truncate text-fg">{m.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
