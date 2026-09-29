'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Bell, BellOff, Loader2, Lock, MessageSquare, Send } from 'lucide-react';
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
import { ConnectionPeerAvatar } from '@/components/dashboard/ConnectionPeerAvatar';
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
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
        <Lock className="h-5 w-5" aria-hidden />
      </div>
      <p className="font-semibold text-on-surface">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-on-surface-variant">{body}</p>
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
}: {
  beaconId: string;
  creatorId: string | null;
  ended: boolean;
  /** Server-rendered RSVP state, so going guests never see the locked state first. */
  initialGoing?: boolean | null;
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
  const [muteMenuOpen, setMuteMenuOpen] = useState(false);
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

  const header = (
    <div className="flex items-center justify-between gap-3 border-b border-border-hard px-4 py-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-base font-bold text-on-surface">
          <MessageSquare className="h-4 w-4 text-primary" aria-hidden />
          Event chat
        </h2>
        <p className="text-xs text-on-surface-variant">
          {canJoin && hubId ? `${occupants} ${occupants === 1 ? 'person' : 'people'} · end-to-end encrypted` : 'For hosts and guests who RSVP'}
        </p>
      </div>
      {hubId && canJoin ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMuteMenuOpen((o) => !o)}
            aria-expanded={muteMenuOpen}
            aria-haspopup="menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-border-hard text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
            aria-label={mute ? 'Notifications muted — change' : 'Mute notifications'}
            title={mute ? 'Muted' : 'Notifications on'}
          >
            {mute ? <BellOff className="h-4 w-4" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
          </button>
          {muteMenuOpen ? (
            <div role="menu" className="absolute right-0 top-[calc(100%+0.4rem)] z-20 w-56 rounded-[12px] border border-border-hard bg-surface p-1.5 shadow-xl">
              {(mute ? [{ label: 'Unmute', ms: null as number | null, muted: false }] : MUTE_OPTIONS.map((o) => ({ ...o, muted: true }))).map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMuteMenuOpen(false);
                    void setMuted(hubId, option.muted, option.ms).catch(() => setSendError("Couldn't change notifications."));
                  }}
                  className="flex w-full rounded-[8px] px-3 py-2 text-left text-sm font-semibold text-on-surface hover:bg-surface-container-low"
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  let body: React.ReactNode;
  if (authLoading || (user && !isHost && rsvp === undefined)) {
    body = <div className="h-40 animate-pulse bg-surface-container-low" />;
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
          className="chat-thread-scroll h-[min(28rem,60vh)] space-y-1 px-3 py-3"
          aria-live="polite"
        >
          {loading && messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-on-surface-variant">
              <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading event chat" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="font-semibold text-on-surface">No messages yet</p>
              <p className="mt-1 text-sm text-on-surface-variant">Say hi, share a meeting spot, or ask the host a question.</p>
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
                    <p className="py-2 text-center text-xs font-semibold text-on-surface-variant">{day}</p>
                  ) : null}
                  <div className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start', grouped ? 'mt-0.5' : 'mt-2')}>
                    {!mine ? (
                      <div className="w-8 shrink-0">
                        {!grouped ? <ConnectionPeerAvatar label={sender} imageUrl={names[m.userId]?.image} size="sm" /> : null}
                      </div>
                    ) : null}
                    <div className={cn('flex max-w-[78%] flex-col', mine ? 'items-end' : 'items-start')}>
                      {!mine && !grouped ? (
                        <span className="mb-0.5 px-1 text-xs font-semibold text-on-surface-variant">
                          {sender}
                          {m.userId === creatorId ? <span className="ml-1 text-primary">· Host</span> : null}
                        </span>
                      ) : null}
                      <div
                        className={cn(
                          'rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words',
                          mine ? 'rounded-br-sm bg-primary text-on-primary' : 'rounded-bl-sm border border-border-hard bg-surface-container text-on-surface',
                          m.pending && 'opacity-70',
                        )}
                      >
                        <LinkifiedText text={m.text} variant={mine ? 'mine' : 'theirs'} />
                      </div>
                      {reactions.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {reactions.map(([emoji, users]) => (
                            <span key={emoji} className="rounded-full border border-border-hard bg-surface px-1.5 py-0.5 text-xs">
                              {emoji} {users.length}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {!grouped || index === messages.length - 1 ? (
                        <span className="mt-0.5 px-1 text-[11px] text-on-surface-variant">
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
          className="flex items-end gap-2 border-t border-border-hard p-3"
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
            className="fc-input max-h-28 min-h-10 flex-1 resize-none px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending || !hubId}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-primary text-on-primary disabled:opacity-30"
            aria-label="Send to event chat"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
        {sendError ? (
          <p role="alert" className="px-4 pb-3 text-sm text-error">
            {sendError}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <section className="overflow-hidden rounded-[16px] border border-border-hard bg-surface" data-testid="event-chat-panel" aria-label="Event chat">
      {header}
      {body}
    </section>
  );
}
