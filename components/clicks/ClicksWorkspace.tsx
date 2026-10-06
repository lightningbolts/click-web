'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, SearchX } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { getSupabaseClient } from '@/lib/supabase';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';
import { ChatView } from '@/components/chat';
import { ChatBackground } from '@/components/chat/ChatBackground';
import { useChatMutes } from '@/components/chat/useConversationExtras';
import type { ChatListConnection } from './types';
import { useConfirm } from '@/components/ds/ConfirmDialog';
import { EmptyState } from '@/components/ds/EmptyState';
import { toast } from '@/components/ds/Toast';
import { connectionRecordToArchiveRow, getArchiveCountdown } from '@/lib/dashboard/connectionStatus';
import { deleteCliqueRpc, leaveCliqueRpc, renameCliqueRpc } from '@/lib/chat/createVerifiedClick';
import { markChatUnread } from '@/lib/chat/conversationApi';
import type { ChatSearchHit } from '@/lib/chat/searchSnippet';
import { clicksHref, filterForThread, parseClicksFilter, parseClicksThread, type ClicksFilter } from '@/lib/clicks/route';
import { groupThreadHref, hubThreadHref, personHref, threadHref } from '@/lib/shell/appNav';
import { cn } from '@/lib/cn';
import { Inbox } from './Inbox';
import type { InboxRowActions, InboxRowState } from './InboxRow';
import { HubsList } from './HubsList';
import { HubThread } from './HubThread';
import { MembersDialog, RenameGroupDialog, ReportDialog } from './ClickDialogs';
import { useClicksData } from './useClicksData';

const CreateVerifiedClickDialog = dynamic(() => import('@/components/chat/CreateVerifiedClickDialog'), { ssr: false });
const PostConnectionVibePrompt = dynamic(() => import('@/components/dashboard/PostConnectionVibePrompt'), { ssr: false });

const hrefFor = (c: Pick<ChatListConnection, 'id' | 'chatKind'>) => (c.chatKind === 'group_clique' ? groupThreadHref(c.id) : threadHref(c.id));
const unreadOf = (rows: ChatListConnection[]) => rows.reduce((n, c) => n + (c.chatUnreadCount ?? 0), 0);

/**
 * The Clicks workspace (spec §7.2), mounted by `app/(app)/clicks/layout.tsx` so the inbox and
 * an open thread persist across `/clicks`, `/clicks/c/[id]`, `/clicks/g/[id]` and `/clicks/h/[id]`.
 *
 * ≥1024: inbox 360 + thread (+ details inside the thread). 768–1023: inbox 320 + thread.
 * <768: the inbox, or a full-screen thread (the shell hides its bars on thread routes).
 */
export function ClicksWorkspace() {
  const { user, onlineUserIds } = useAuth();
  if (!user) return null;
  return <Workspace user={user} onlineUserIds={onlineUserIds} />;
}

function Workspace({
  user,
  onlineUserIds,
}: {
  user: NonNullable<ReturnType<typeof useAuth>['user']>;
  onlineUserIds: ReadonlySet<string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const thread = parseClicksThread(pathname);
  const targetMessageId = searchParams.get('m');
  const urlFilter = parseClicksFilter(searchParams.get('filter'));

  const [filter, setFilter] = useState<ClicksFilter>(() => filterForThread(thread, false) ?? urlFilter);
  // On the bare inbox the URL owns the filter; while a thread is open the last one sticks.
  if (!thread && filter !== urlFilter) setFilter(urlFilter);

  // Old `/clicks?filter=hubs&hub=…` links (notifications, bookmarks) open the hub thread.
  const legacyHub = !thread ? searchParams.get('hub') : null;
  useEffect(() => {
    if (legacyHub) router.replace(hubThreadHref(legacyHub));
  }, [legacyHub, router]);

  const closeThread = useCallback(() => router.push(clicksHref(filter)), [router, filter]);
  const data = useClicksData({
    user: user as unknown as { id: string } & Record<string, unknown>,
    selectedId: thread && thread.kind !== 'h' ? thread.id : null,
    onThreadClosed: closeThread,
  });
  const { lifecycle, cliques, search, coreConnectionIds, blockedUserIds } = data;
  const { muteFor, setMuted } = useChatMutes();
  const [confirm, confirmNode] = useConfirm();

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const [timeZone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return undefined;
    }
  });

  const [createOpen, setCreateOpen] = useState(false);
  // `/clicks?new=group` (Add Click's "New group") opens the dialog once, then drops the param.
  const wantsNewGroup = !thread && searchParams.get('new') === 'group';
  if (wantsNewGroup && !createOpen) setCreateOpen(true);
  useEffect(() => {
    if (wantsNewGroup) router.replace(clicksHref(filter), { scroll: false });
  }, [wantsNewGroup, router, filter]);
  const [reportTarget, setReportTarget] = useState<ChatListConnection | null>(null);
  const [renameTarget, setRenameTarget] = useState<ChatListConnection | null>(null);

  const groups = useMemo(() => data.active.filter((c) => c.chatKind === 'group_clique'), [data.active]);
  const rows = filter === 'groups' ? groups : filter === 'archived' ? data.archived : data.active;
  const unreadByFilter = useMemo(
    () => ({ active: unreadOf(data.active), groups: unreadOf(groups), archived: unreadOf(data.archived) }),
    [data.active, data.archived, groups],
  );

  const selectedId = thread?.kind !== 'h' ? thread?.id : null;
  const rowState = useCallback(
    (c: ChatListConnection): InboxRowState => {
      const isGroup = c.chatKind === 'group_clique';
      const archived = data.isArchived(c);
      const countdown = !isGroup && !archived ? getArchiveCountdown(connectionRecordToArchiveRow(c), nowMs) : null;
      return {
        href: hrefFor(c),
        selected: selectedId === c.id,
        online: Boolean(c.otherUserId && onlineUserIds.has(c.otherUserId)),
        core: coreConnectionIds.has(c.id),
        muted: Boolean(muteFor([c.chatId, c.id])),
        archived,
        blocked: Boolean(c.otherUserId && blockedUserIds.has(c.otherUserId)),
        groupCreator: isGroup && c.groupCreatedByUserId === user.id,
        sayHiDeadline: countdown?.kind === 'initial_message' ? countdown.deadlineMs : null,
      };
    },
    [blockedUserIds, coreConnectionIds, data, muteFor, nowMs, onlineUserIds, selectedId, user.id],
  );

  const groupAction = useCallback(
    async (conn: ChatListConnection, kind: 'leave' | 'delete') => {
      const ok = await confirm(
        kind === 'leave'
          ? { title: `Leave ${conn.name}?`, message: 'You’ll stop getting messages from this group.', confirmLabel: 'Leave', destructive: true }
          : {
              title: `Delete ${conn.name}?`,
              message: 'The group and all its messages are removed for everyone. This can’t be undone.',
              confirmLabel: 'Delete',
              destructive: true,
            },
      );
      if (!ok) return;
      const supabase = getSupabaseClient();
      if (!supabase) return;
      try {
        await (kind === 'leave' ? leaveCliqueRpc : deleteCliqueRpc)(supabase, conn.id);
        if (selectedId === conn.id) closeThread();
        data.reloadGroups();
        toast(kind === 'leave' ? 'You left the group' : 'Group deleted');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      }
    },
    [closeThread, confirm, data, selectedId],
  );

  const actions = useMemo<InboxRowActions>(
    () => ({
      setMuted: (c, muted, ms) => {
        setMuted(c.chatId ?? c.id, muted, ms).catch(() => toast.error('Couldn’t change notifications. Try again.'));
      },
      markUnread: (c) => {
        if (!c.chatId) return;
        markChatUnread(c.chatId)
          .then(() => data.refreshPreviews())
          .catch(() => toast.error('Couldn’t mark as unread.'));
      },
      toggleCore: (c) => {
        void (coreConnectionIds.has(c.id) ? lifecycle.removeConnectionFromCore(c.id) : lifecycle.addConnectionToCore(c.id));
      },
      viewProfile: (c) => {
        if (c.otherUserId) router.push(personHref(c.otherUserId));
      },
      toggleArchive: (c) => {
        if (data.isArchived(c)) {
          void lifecycle.unarchiveConnection(c.id);
          return;
        }
        void lifecycle.archiveConnection(c.id).then((ok) => {
          if (ok) toast(`${c.name} archived`, { action: { label: 'Undo', onClick: () => void lifecycle.unarchiveConnection(c.id) } });
        });
      },
      report: (c) => setReportTarget(c),
      remove: (c) => {
        void confirm({
          title: `Remove ${c.name}?`,
          message: 'Your conversation and this Click are removed. They aren’t notified.',
          confirmLabel: 'Remove',
          destructive: true,
        }).then((ok) => {
          if (ok) void lifecycle.removeConnection(c.id);
        });
      },
      toggleBlock: (c) => {
        if (c.otherUserId && blockedUserIds.has(c.otherUserId)) {
          void lifecycle.unblockUser(c);
          return;
        }
        void confirm({
          title: `Block ${c.name}?`,
          message: 'They can’t message you or see you on the map, and this Click is removed.',
          confirmLabel: 'Block',
          destructive: true,
        }).then((ok) => {
          if (ok) void lifecycle.blockUser(c);
        });
      },
      showMembers: (c) => void cliques.openVerifiedCliqueMemberPicker(c.userIds ?? []),
      renameGroup: (c) => setRenameTarget(c),
      leaveGroup: (c) => void groupAction(c, 'leave'),
      deleteGroup: (c) => void groupAction(c, 'delete'),
    }),
    [blockedUserIds, cliques, confirm, coreConnectionIds, data, groupAction, lifecycle, router, setMuted],
  );

  const openSearchHit = (hit: ChatSearchHit) => {
    const conn = [...data.connectionRecords, ...data.groupCliqueRecords].find(
      (c) => c.id === hit.connectionId || c.id === hit.conversationId || c.groupChatId === hit.chatId,
    );
    if (!conn) return;
    const href = conn.chatKind === 'group_clique' ? groupThreadHref(conn.id) : threadHref(conn.id);
    router.push(`${href}?m=${encodeURIComponent(hit.messageId)}`);
  };

  const onFilterChange = (next: ClicksFilter) => {
    setFilter(next);
    if (!thread) router.replace(clicksHref(next), { scroll: false });
  };

  const selected = data.selectedConnection;
  const userName = displayNameFromUserMetadata(user.user_metadata) || user.email?.split('@')[0] || 'You';
  const supabase = getSupabaseClient();

  return (
    <div
      data-testid="clicks-workspace"
      className="flex h-[calc(100dvh-var(--topbar-height)-var(--tabbar-height))] min-h-0 overflow-hidden max-md:data-[thread=true]:h-dvh"
      data-thread={thread ? 'true' : undefined}
    >
      <aside
        aria-label="Clicks"
        className={cn('min-h-0 w-full shrink-0 border-hairline bg-surface md:w-80 md:border-r lg:w-[360px]', thread ? 'max-md:hidden' : 'flex flex-col')}
      >
        <Inbox
          viewerId={user.id}
          filter={filter}
          onFilterChange={onFilterChange}
          rows={rows}
          unreadByFilter={unreadByFilter}
          core={data.core}
          rowState={rowState}
          nowMs={nowMs}
          timeZone={timeZone}
          actions={actions}
          onlineUserIds={onlineUserIds}
          onNewGroup={() => setCreateOpen(true)}
          search={{ query: search.chatSearchQuery, setQuery: search.setChatSearchQuery, busy: search.chatSearchBusy, hits: search.chatSearchHits }}
          onOpenSearchHit={openSearchHit}
          hubs={<HubsList selectedHubId={thread?.kind === 'h' ? thread.id : null} />}
        />
      </aside>

      <section aria-label="Conversation" className={cn('relative min-h-0 min-w-0 flex-1', !thread && 'max-md:hidden')}>
        {thread?.kind === 'h' ? (
          <HubThread key={thread.id} hubId={thread.id} userId={user.id} onBack={closeThread} />
        ) : thread && selected ? (
          <ChatView
            key={selected.id}
            connection={selected}
            currentUserId={user.id}
            otherUserName={selected.name}
            active
            isArchived={data.isArchived(selected)}
            isBlocked={selected.otherUserId ? blockedUserIds.has(selected.otherUserId) : false}
            isCore={coreConnectionIds.has(selected.id)}
            onAddToCore={() => lifecycle.addConnectionToCore(selected.id)}
            onRemoveFromCore={() => lifecycle.removeConnectionFromCore(selected.id)}
            onArchive={() => lifecycle.archiveConnection(selected.id)}
            onUnarchive={() => lifecycle.unarchiveConnection(selected.id)}
            onRemove={() => lifecycle.removeConnection(selected.id)}
            onReport={(reason) => lifecycle.reportConnection(selected.id, reason)}
            onBlock={() => lifecycle.blockUser(selected)}
            onUnblock={() => lifecycle.unblockUser(selected)}
            onClose={closeThread}
            onRequestJump={(messageId) => router.replace(`${hrefFor(selected)}?m=${encodeURIComponent(messageId)}`, { scroll: false })}
            onOpenProfile={(id) => router.push(personHref(id))}
            onGroupChatChanged={data.reloadGroups}
            targetMessageId={targetMessageId}
          />
        ) : thread && data.loaded ? (
          <div className="relative flex h-full items-center justify-center">
            <ChatBackground seed={thread.id} />
            <EmptyState
              icon={SearchX}
              title="Conversation not found"
              body="It may have been removed, or you’re signed in to a different account."
              action={undefined}
            />
          </div>
        ) : (
          <div className="relative flex h-full items-center justify-center">
            <ChatBackground seed={user.id} />
            {thread ? null : (
              <EmptyState
                icon={MessageCircle}
                title="Pick up a conversation"
                body="Choose someone from your Clicks. Plans, pinned messages and notifications live in each conversation’s details."
              />
            )}
          </div>
        )}
      </section>

      {supabase && createOpen ? (
        <CreateVerifiedClickDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          supabase={supabase}
          currentUserId={user.id}
          currentUserLabel={userName}
          friends={data.friendOptions}
          existingVerifiedMemberSetKeys={cliques.verifiedClickMemberSetKeys}
          onCreated={data.reloadGroups}
        />
      ) : null}
      {reportTarget ? (
        <ReportDialog
          name={reportTarget.name}
          open
          onOpenChange={(o) => (o ? undefined : setReportTarget(null))}
          onSubmit={async (reason) => {
            const ok = await lifecycle.reportConnection(reportTarget.id, reason);
            if (ok) toast('Report sent. Thanks for telling us.');
            return ok;
          }}
        />
      ) : null}
      {renameTarget && supabase ? (
        <RenameGroupDialog
          key={renameTarget.id}
          initialName={renameTarget.name}
          open
          onOpenChange={(o) => (o ? undefined : setRenameTarget(null))}
          onSubmit={async (name) => {
            await renameCliqueRpc(supabase, renameTarget.id, name);
            data.reloadGroups();
          }}
        />
      ) : null}
      <MembersDialog
        open={cliques.showGroupMemberPicker && cliques.groupMemberPickerRows.length > 0}
        onOpenChange={cliques.setShowGroupMemberPicker}
        members={cliques.groupMemberPickerRows}
      />
      {data.vibePromptConnection ? (
        <PostConnectionVibePrompt
          connectionId={data.vibePromptConnection.id}
          currentUserId={user.id}
          venueLabel={data.vibePromptConnection.location || 'This place'}
          getAuthHeaders={getFreshAuthHeaders}
          onClose={() => data.setVibePromptConnection(null)}
        />
      ) : null}
      {confirmNode}
    </div>
  );
}
