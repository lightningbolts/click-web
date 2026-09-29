'use client';

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { MessageCircle, Users } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { ChatView } from '@/components/chat';
import { ConversationList, type ChatListConnection, type ConversationRowActions } from '@/components/chat/ConversationList';
import { useChatMutes } from '@/components/chat/useConversationExtras';
import { deleteCliqueRpc, leaveCliqueRpc } from '@/lib/chat/createVerifiedClick';
import type { ChatSearchHit } from '@/lib/chat/searchSnippet';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import type { Message } from '@/lib/chat/types';
import { cn } from '@/lib/cn';
import { CHAT_PANEL_CLASS } from '@/lib/chat/layout';

/**
 * The dashboard's Chat tab. Desktop is a two-pane messenger: the inbox column stays in view
 * while a conversation is open (and the thread can add its own details column). Below `md`
 * it is one pane at a time, list then thread, like the phone.
 */
export function ChatTabSection({
  user,
  active,
  onlineUserIds,
  selectedConnection,
  setSelectedConnection,
  targetMessageId,
  setTargetMessageId,
  connectionRecords,
  groupCliqueRecords,
  archivedConnectionIds,
  blockedUserIds,
  coreConnectionIds,
  activeConnections,
  archivedConnections,
  visibleChatConnections,
  chatListTab,
  setChatListTab,
  chatSearchQuery,
  setChatSearchQuery,
  chatSearchBusy,
  chatSearchHits,
  handleOpenChat,
  formatChatActivity,
  menuConnectionId,
  setMenuConnectionId,
  addConnectionToCore,
  removeConnectionFromCore,
  archiveConnection,
  unarchiveConnection,
  removeConnection,
  reportConnection,
  blockUser,
  unblockUser,
  setCreateClickOpen,
  setProfileUserId,
  setProfileConnectionId,
  setGroupClicksReloadNonce,
  setChatMessagesSnapshot,
  openVerifiedCliqueMemberPicker,
  selectedConnectionRef,
  setChatListGroupRenameGroupId,
  setChatListGroupRenameInput,
  chatListGroupActionBusyId,
  setChatListGroupActionBusyId,
}: {
  user: any;
  /** False while the Chat tab is hidden but kept mounted. */
  active: boolean;
  onlineUserIds: ReadonlySet<string>;
  selectedConnection: ConnectionRecord | null;
  setSelectedConnection: Dispatch<SetStateAction<ConnectionRecord | null>>;
  targetMessageId: string | null;
  setTargetMessageId: Dispatch<SetStateAction<string | null>>;
  connectionRecords: ConnectionRecord[];
  groupCliqueRecords: ConnectionRecord[];
  archivedConnectionIds: Set<string>;
  blockedUserIds: Set<string>;
  coreConnectionIds: Set<string>;
  activeConnections: ChatListConnection[];
  archivedConnections: ChatListConnection[];
  visibleChatConnections: ChatListConnection[];
  chatListTab: 'active' | 'archived';
  setChatListTab: Dispatch<SetStateAction<'active' | 'archived'>>;
  chatSearchQuery: string;
  setChatSearchQuery: Dispatch<SetStateAction<string>>;
  chatSearchBusy: boolean;
  chatSearchHits: ChatSearchHit[];
  handleOpenChat: (conn: ConnectionRecord, messageId?: string | null) => void;
  formatChatActivity: (timestamp?: number | null) => string | null;
  menuConnectionId: string | null;
  setMenuConnectionId: Dispatch<SetStateAction<string | null>>;
  addConnectionToCore: (connectionId: string) => Promise<boolean>;
  removeConnectionFromCore: (connectionId: string) => Promise<boolean>;
  archiveConnection: (connectionId: string) => Promise<boolean>;
  unarchiveConnection: (connectionId: string) => Promise<boolean>;
  removeConnection: (connectionId: string) => Promise<boolean>;
  reportConnection: (connectionId: string, reason: string) => Promise<boolean>;
  blockUser: (connection: ConnectionRecord) => Promise<boolean>;
  unblockUser: (connection: ConnectionRecord) => Promise<boolean>;
  setCreateClickOpen: Dispatch<SetStateAction<boolean>>;
  setProfileUserId: Dispatch<SetStateAction<string | null>>;
  setProfileConnectionId: Dispatch<SetStateAction<string | null>>;
  setGroupClicksReloadNonce: Dispatch<SetStateAction<number>>;
  setChatMessagesSnapshot: Dispatch<SetStateAction<Message[]>>;
  openVerifiedCliqueMemberPicker: (memberUserIds: string[]) => Promise<void>;
  selectedConnectionRef: MutableRefObject<ConnectionRecord | null>;
  setChatListGroupRenameGroupId: Dispatch<SetStateAction<string | null>>;
  setChatListGroupRenameInput: Dispatch<SetStateAction<string>>;
  chatListGroupActionBusyId: string | null;
  setChatListGroupActionBusyId: Dispatch<SetStateAction<string | null>>;
}) {
  const { muteFor, setMuted } = useChatMutes();

  const runGroupAction = useCallback(
    async (conn: ConnectionRecord, confirmText: string, action: typeof leaveCliqueRpc, failure: string) => {
      if (!window.confirm(confirmText)) return;
      const supabase = getSupabaseClient();
      if (!supabase) {
        window.alert('Sign in required.');
        return;
      }
      setChatListGroupActionBusyId(conn.id);
      try {
        await action(supabase, conn.id);
        if (selectedConnectionRef.current?.id === conn.id) setSelectedConnection(null);
        setGroupClicksReloadNonce((n) => n + 1);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : failure);
      } finally {
        setChatListGroupActionBusyId(null);
      }
    },
    [selectedConnectionRef, setChatListGroupActionBusyId, setGroupClicksReloadNonce, setSelectedConnection],
  );

  const actions: ConversationRowActions = {
    open: (conn) => {
      setTargetMessageId(null);
      setSelectedConnection(conn);
    },
    openProfile: (conn, peerId) => {
      setProfileConnectionId(conn.id);
      setProfileUserId(peerId);
    },
    openMembers: (conn) => void openVerifiedCliqueMemberPicker(conn.userIds ?? []),
    setMuted: (conn, muted, ms) => {
      void setMuted(conn.chatId ?? conn.id, muted, ms).catch(() => window.alert("Couldn't change notifications. Try again."));
    },
    addToCore: (id) => void addConnectionToCore(id),
    removeFromCore: (id) => void removeConnectionFromCore(id),
    archive: (id) => void archiveConnection(id),
    unarchive: (id) => void unarchiveConnection(id),
    report: (conn) => {
      const reason = window.prompt('What happened? This goes to moderation review.');
      if (reason?.trim()) void reportConnection(conn.id, reason.trim());
    },
    block: (conn) => {
      if (window.confirm(`Block ${conn.name} and remove this connection?`)) void blockUser(conn);
    },
    unblock: (conn) => void unblockUser(conn),
    remove: (conn) => {
      if (window.confirm(`Remove your connection with ${conn.name}?`)) void removeConnection(conn.id);
    },
    renameGroup: (conn) => {
      setChatListGroupRenameGroupId(conn.id);
      setChatListGroupRenameInput(conn.name);
    },
    leaveGroup: (conn) =>
      void runGroupAction(
        conn,
        'Leave this verified clique? You will stop receiving messages in this group.',
        leaveCliqueRpc,
        'Could not leave group',
      ),
    deleteGroup: (conn) =>
      void runGroupAction(
        conn,
        'Delete this verified clique for everyone? All messages will be removed. This cannot be undone.',
        deleteCliqueRpc,
        'Could not delete group',
      ),
  };

  const openSearchHit = (hit: ChatSearchHit) => {
    const conn = [...connectionRecords, ...groupCliqueRecords].find(
      (c) => c.id === hit.connectionId || c.id === hit.conversationId || c.groupChatId === hit.chatId,
    );
    if (conn) handleOpenChat(conn, hit.messageId);
  };

  return (
    <div className="grid h-full min-h-0 gap-4 md:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)]">
      <aside
        className={cn(CHAT_PANEL_CLASS, selectedConnection ? 'hidden md:flex' : 'flex')}
        aria-label="Conversations"
      >
        <ConversationList
          viewerId={user.id}
          connections={visibleChatConnections}
          activeCount={activeConnections.length}
          archivedCount={archivedConnections.length}
          listTab={chatListTab}
          onListTabChange={setChatListTab}
          selectedId={selectedConnection?.id ?? null}
          onlineUserIds={onlineUserIds}
          coreConnectionIds={coreConnectionIds}
          archivedConnectionIds={archivedConnectionIds}
          blockedUserIds={blockedUserIds}
          muteFor={muteFor}
          searchQuery={chatSearchQuery}
          onSearchQueryChange={setChatSearchQuery}
          searchBusy={chatSearchBusy}
          searchHits={chatSearchHits}
          onOpenSearchHit={openSearchHit}
          formatActivity={formatChatActivity}
          menuConnectionId={menuConnectionId}
          setMenuConnectionId={setMenuConnectionId}
          busyGroupId={chatListGroupActionBusyId}
          actions={actions}
          headerAction={
            <button
              type="button"
              onClick={() => setCreateClickOpen(true)}
              className="fc-btn-secondary inline-flex h-9 items-center gap-1.5 px-3 text-sm"
            >
              <Users className="h-4 w-4" aria-hidden />
              New group
            </button>
          }
        />
      </aside>

      <section
        className={cn('min-h-0 min-w-0', selectedConnection ? 'block' : 'hidden md:block')}
        aria-label="Conversation"
      >
        {selectedConnection ? (
          <ChatView
            key={selectedConnection.id}
            connection={selectedConnection}
            currentUserId={user.id}
            otherUserName={selectedConnection.name}
            active={active}
            isArchived={archivedConnectionIds.has(selectedConnection.id) || selectedConnection.status === 'archived'}
            isBlocked={selectedConnection.otherUserId ? blockedUserIds.has(selectedConnection.otherUserId) : false}
            isCore={coreConnectionIds.has(selectedConnection.id)}
            onAddToCore={() => addConnectionToCore(selectedConnection.id)}
            onRemoveFromCore={() => removeConnectionFromCore(selectedConnection.id)}
            onArchive={() => archiveConnection(selectedConnection.id)}
            onUnarchive={() => unarchiveConnection(selectedConnection.id)}
            onRemove={() => removeConnection(selectedConnection.id)}
            onReport={(reason) => reportConnection(selectedConnection.id, reason)}
            onBlock={() => blockUser(selectedConnection)}
            onUnblock={() => unblockUser(selectedConnection)}
            onClose={() => {
              setSelectedConnection(null);
              setTargetMessageId(null);
            }}
            onRequestJump={(messageId) => setTargetMessageId(messageId)}
            onOpenProfile={(id) => {
              setProfileConnectionId(selectedConnection?.id ?? null);
              setProfileUserId(id);
            }}
            onGroupChatChanged={() => setGroupClicksReloadNonce((n) => n + 1)}
            onMessagesSnapshot={setChatMessagesSnapshot}
            targetMessageId={targetMessageId}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center rounded-[16px] border border-dashed border-border-hard px-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
              <MessageCircle className="h-6 w-6" aria-hidden />
            </div>
            <p className="text-lg font-bold text-on-surface">Pick up a conversation</p>
            <p className="mt-1 max-w-sm text-sm text-on-surface-variant">
              Choose someone you met from the list. Plans, pinned messages, and notification settings live in each
              conversation&apos;s details.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
