'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { ArrowUp, Bell, BellOff, Lock, MessageSquare } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { IconButton } from '@/components/ds/IconButton';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ds/Menu';
import { Skeleton } from '@/components/ds/Skeleton';
import { Spinner } from '@/components/ds/Spinner';
import { fieldClassName } from '@/components/ds/TextField';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { eventRsvpKey } from '@/lib/events/eventRsvpKey';
import { fetchEventRsvpPayload } from '@/lib/events/eventRsvpClient';
import {
  EventChatError,
  fetchHubTimeline,
  hubDisplayNames,
  hubSession,
  resolveEventChat,
  sendHubText,
  toHubChatMessage,
  type HubChatMessage,
} from '@/lib/hub/hubChatClient';
import { normalizeHubMessageRow } from '@/lib/hub/hubThread';
import { useChatMutes } from '@/components/chat/useConversationExtras';
import { MUTE_OPTIONS } from '@/lib/chat/conversationApi';
import { LinkifiedText } from '@/lib/chat/linkify';
import { cn } from '@/lib/cn';

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function LockedState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-surface-raised text-fg-secondary">
        <Lock size={20} aria-hidden />
      </div>
      <p className="type-body-strong text-fg">{title}</p>
      <p className="type-meta mt-1 max-w-xs text-fg-secondary">{body}</p>
    </div>
  );
}

/**
 * Event chat on the event page: the event's Community Hub, with the same realtime,
 * on-device decryption, and notification controls as direct messages. Guests who RSVP'd
 * and hosts can read and post (server policy `evaluateEventHubAccess`).
 */
export default function EventChatPanel({
  beaconId,
  creatorId,
  ended,
  initialGoing = null,
  bare = false,
}: {
  beaconId: string;
  creatorId: string | null;
  ended: boolean;
  /** Server-rendered RSVP state, so going guests never see the locked state first. */
  initialGoing?: boolean | null;
  /** Inside a Sheet: no card chrome or title (the sheet has both). */
  bare?: boolean;
}) {
  const { user, loading: authLoading } = useAuth();
  const isHost = Boolean(user?.id && creatorId && user.id === creatorId);
  const { data: rsvp } = useSWR(user && !isHost ? eventRsvpKey(beaconId) : null, fetchEventRsvpPayload, {
    revalidateOnFocus: false,
    fallbackData: initialGoing != null ? { current_user_signed_up: initialGoing } : undefined,
  });
  const going = Boolean(rsvp?.current_user_signed_up);
  const canJoin = Boolean(user) && (isHost || going);

  const [hubId, setHubId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<EventChatError | null>(null);
  const [messages, setMessages] = useState<HubChatMessage[]>([]);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [occupants, setOccupants] = useState(0);
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState<Record<string, { name: string; image: string | null }>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const { muteFor, setMuted } = useChatMutes();
  const mute = hubId ? muteFor([hubId]) : null;

  // Resolve the canonical hub, then load its timeline.
  useEffect(() => {
    if (!canJoin) return;
    let cancelled = false;
    setLoading(true);
    setResolveError(null);
    void (async () => {
      try {
        const target = await resolveEventChat(beaconId);
        if (cancelled) return;
        setHubId(target.hubId);
        const timeline = await fetchHubTimeline(target.hubId);
        if (cancelled) return;
        setMessages(timeline.messages);
        setParticipantIds(timeline.participantIds);
        setOccupants(timeline.occupantCount);
      } catch (error) {
        if (!cancelled) {
          setResolveError(error instanceof EventChatError ? error : new EventChatError('failed', 'Could not open this event chat.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [beaconId, canJoin]);

  // Sender names for everyone who has posted.
  const senderIds = useMemo(
    () => [...new Set(messages.map((m) => m.userId).filter((id) => id && id !== user?.id))],
    [messages, user?.id],
  );
  useEffect(() => {
    const missing = senderIds.filter((id) => !names[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void hubDisplayNames(missing).then((found) => {
      if (!cancelled) setNames((prev) => ({ ...prev, ...found }));
    });
    return () => {
      cancelled = true;
    };
  }, [names, senderIds]);

  // Realtime: rows for this hub only (RLS-scoped), decrypted on arrival.
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !hubId) return;
    const channel = supabase
      .channel(`realtime:hub:${hubId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hub_messages', filter: `hub_id=eq.${hubId}` },
        async (payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          if (payload.eventType === 'DELETE') {
            const id = typeof payload.old?.id === 'string' ? payload.old.id : null;
            if (id) setMessages((prev) => prev.filter((m) => m.id !== id));
            return;
          }
          const row = normalizeHubMessageRow(payload.new ?? null);
          if (!row) return;
          const session = row.body.startsWith('e2e2:') ? await hubSession(hubId, participantIds) : null;
          const next = await toHubChatMessage(row, session);
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === next.id);
            const merged = existing ? { ...next, reactions: existing.reactions } : next;
            const without = prev.filter((m) => m.id !== next.id && !(m.pending && m.userId === next.userId && m.text === next.text));
            return [...without, merged].sort((a, b) => a.createdAt - b.createdAt);
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [hubId, participantIds]);

  // Keep the newest message in view unless the reader scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !hubId || sending || !user) return;
    setSending(true);
    setSendError(null);
    const tempId = `pending-${crypto.randomUUID()}`;
    stickToBottomRef.current = true;
    setMessages((prev) => [
      ...prev,
      { id: tempId, userId: user.id, text, messageType: 'text', createdAt: Date.now(), edited: false, reactions: {}, pending: true },
    ]);
    setDraft('');
    try {
      const row = await sendHubText(hubId, text, participantIds);
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== tempId && m.id !== row.id)
          .concat({ id: row.id, userId: user.id, text, messageType: 'text', createdAt: Date.parse(row.created_at) || Date.now(), edited: false, reactions: {} })
          .sort((a, b) => a.createdAt - b.createdAt),
      );
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(text);
      setSendError(error instanceof Error ? error.message : 'Could not send.');
    } finally {
      setSending(false);
    }
  }, [draft, hubId, participantIds, sending, user]);

  const subtitle = canJoin && hubId ? `${occupants} ${occupants === 1 ? 'person' : 'people'} · end-to-end encrypted` : 'For hosts and guests who RSVP';
  const header = (
    <div className={cn('flex items-center justify-between gap-3 px-4', bare ? 'pb-2' : 'border-b border-hairline py-3')}>
      <div className="min-w-0">
        {bare ? null : (
          <h2 className="type-headline flex items-center gap-2 text-fg">
            <MessageSquare size={16} className="text-accent" aria-hidden />
            Event chat
          </h2>
        )}
        <p className="type-meta text-fg-secondary">{subtitle}</p>
      </div>
      {hubId && canJoin ? (
        <Menu>
          <MenuTrigger asChild>
            <IconButton
              icon={mute ? BellOff : Bell}
              size="sm"
              aria-label={mute ? 'Notifications muted — change' : 'Mute notifications'}
            />
          </MenuTrigger>
          <MenuContent align="end">
            {(mute ? [{ label: 'Unmute', ms: null as number | null, muted: false }] : MUTE_OPTIONS.map((o) => ({ ...o, muted: true }))).map((option) => (
              <MenuItem
                key={option.label}
                onSelect={() => void setMuted(hubId, option.muted, option.ms).catch(() => setSendError("Couldn't change notifications."))}
              >
                {option.label}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      ) : null}
    </div>
  );

  let body: React.ReactNode;
  if (authLoading || (user && !isHost && rsvp === undefined)) {
    body = <Skeleton className="mx-4 my-3 h-40" rounded="md" />;
  } else if (!user) {
    body = <LockedState title="Sign in to join the chat" body="Guests who RSVP with a Click account can talk before, during, and after the event." />;
  } else if (!canJoin) {
    body = <LockedState title={ended ? 'Chat is for people who went' : 'RSVP to join the chat'} body="The event chat opens to hosts and everyone going." />;
  } else if (resolveError) {
    body = (
      <LockedState
        title={resolveError.code === 'expired' ? 'This chat has closed' : resolveError.code === 'forbidden' ? 'Not available yet' : 'Chat unavailable'}
        body={resolveError.code === 'expired' ? 'Event chats close a day after the event ends.' : resolveError.message}
      />
    );
  } else {
    let lastDay = '';
    body = (
      <>
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className={cn('chat-thread-scroll space-y-1 px-3 py-3', bare ? 'h-[min(32rem,60vh)]' : 'h-[min(28rem,60vh)]')}
          aria-live="polite"
        >
          {loading && messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-fg-secondary" role="status" aria-label="Loading event chat">
              <Spinner size={20} />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="type-body-strong text-fg">No messages yet</p>
              <p className="type-meta mt-1 text-fg-secondary">Say hi, share a meeting spot, or ask the host a question.</p>
            </div>
          ) : (
            messages.map((m, index) => {
              const mine = m.userId === user.id;
              const day = dayLabel(m.createdAt);
              const showDay = day !== lastDay;
              lastDay = day;
              const prev = messages[index - 1];
              const grouped = prev && prev.userId === m.userId && !showDay && m.createdAt - prev.createdAt < 5 * 60 * 1000;
              const sender = names[m.userId]?.name ?? (m.userId === creatorId ? 'Host' : 'Guest');
              const reactions = Object.entries(m.reactions).filter(([, users]) => users.length > 0);
              return (
                <div key={m.id}>
                  {showDay ? (
                    <p className="type-meta py-2 text-center font-semibold text-fg-tertiary">{day}</p>
                  ) : null}
                  <div className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start', grouped ? 'mt-0.5' : 'mt-2')}>
                    {!mine ? (
                      <div className="w-8 shrink-0">
                        {!grouped ? <Avatar seed={m.userId} name={sender} src={names[m.userId]?.image} size={32} /> : null}
                      </div>
                    ) : null}
                    <div className={cn('flex max-w-[78%] flex-col', mine ? 'items-end' : 'items-start')}>
                      {!mine && !grouped ? (
                        <span className="type-meta mb-0.5 px-1 font-semibold text-fg-secondary">
                          {sender}
                          {m.userId === creatorId ? <span className="ml-1 text-accent">· Host</span> : null}
                        </span>
                      ) : null}
                      <div
                        className={cn(
                          'type-body rounded-bubble px-3.5 py-2 break-words',
                          mine ? 'rounded-br-sm bg-bubble-out text-white' : 'rounded-bl-sm bg-bubble-in text-fg',
                          m.pending && 'opacity-70',
                        )}
                      >
                        <LinkifiedText text={m.text} variant={mine ? 'mine' : 'theirs'} />
                      </div>
                      {reactions.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {reactions.map(([emoji, users]) => (
                            <span key={emoji} className="type-meta rounded-full bg-surface-raised px-1.5 py-0.5">
                              {emoji} {users.length}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {!grouped || index === messages.length - 1 ? (
                        <span className="type-badge mt-0.5 px-1 font-normal text-fg-tertiary">
                          {m.pending ? 'Sending…' : timeLabel(m.createdAt)}
                          {m.edited ? ' · edited' : ''}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <form
          className="flex items-end gap-2 border-t border-hairline p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="sr-only" htmlFor={`event-chat-input-${beaconId}`}>
            Message the event
          </label>
          <textarea
            id={`event-chat-input-${beaconId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Message everyone going…"
            className={cn(fieldClassName, 'max-h-28 min-h-10 flex-1 resize-none py-2')}
          />
          <IconButton
            type="submit"
            icon={ArrowUp}
            variant="action"
            disabled={!draft.trim() || sending || !hubId}
            aria-label="Send to event chat"
          />
        </form>
        {sendError ? (
          <p role="alert" className="type-meta px-4 pb-3 text-destructive">
            {sendError}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <section
      className={cn(!bare && 'overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]')}
      data-testid="event-chat-panel"
      aria-label="Event chat"
    >
      {header}
      {body}
    </section>
  );
}
