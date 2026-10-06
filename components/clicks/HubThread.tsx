'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import { ArrowLeft, ArrowUp, CalendarDays, Check, LogOut, MoreHorizontal, Paperclip, Pencil, Reply, Search, Trash2, Users, X } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { CardVisual } from '@/components/ds/CardVisual';
import { useConfirm } from '@/components/ds/ConfirmDialog';
import { IconButton } from '@/components/ds/IconButton';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ds/Menu';
import { SearchField } from '@/components/ds/SearchField';
import { Skeleton } from '@/components/ds/Skeleton';
import { ChatBackground } from '@/components/chat/ChatBackground';
import HubAttachment from '@/components/dashboard/HubAttachment';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { getSupabaseClient } from '@/lib/supabase';
import { freshHubLocation, hubRequest } from '@/lib/hub/client';
import type { HubThreadMessage } from '@/lib/hub/hubThread';
import { forgetHub, rememberHub } from '@/lib/hub/recentHubs';
import { parseE2eeV2Envelope } from '@/lib/chat/e2eeV2';
import { uploadHubAttachment } from '@/lib/hub/mediaClient';
import { decryptWebE2eeV2Message, encryptWebE2eeV2Message, resolveWebHubE2eeV2Session } from '@/lib/chat/e2eeV2Client';
import { eventHref, personHref } from '@/lib/shell/appNav';
import { cn } from '@/lib/cn';

type Hub = { id: string; name: string; category?: string; event_beacon_id?: string | null };
type Reaction = { id: string; hub_message_id: string; user_id: string; reaction_type: string };
type Thread = { messages: HubThreadMessage[]; reactions?: Reaction[]; participant_ids: string[]; occupant_count: number; sender_profiles_visible?: boolean };
type Session = Awaited<ReturnType<typeof resolveWebHubE2eeV2Session>>;

const PAGE = 120;
const UNAVAILABLE = 'Couldn’t decrypt this message';
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const MEDIA_TYPES = new Set(['image', 'audio', 'file', 'video']);

const zero = (s: Session) => s?.epochKeys.forEach((k) => k.fill(0));
const replyTargetId = (m: HubThreadMessage) => {
  const meta = m.metadata && typeof m.metadata === 'object' ? (m.metadata as Record<string, unknown>) : {};
  return typeof meta.reply_to_id === 'string' ? meta.reply_to_id : null;
};
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * A hub conversation at `/clicks/h/[id]` (spec §7.2), restyled into the Clicks thread layout.
 * Data, encryption and location rules are unchanged from the old `HubConversation`.
 */
export function HubThread({ hubId, userId, onBack }: { hubId: string; userId: string; onBack: () => void }) {
  const router = useRouter();
  const { data: hubData, error: hubError } = useSWR(['hub', hubId], () => hubRequest<{ hub: Hub }>(`/api/hub/${encodeURIComponent(hubId)}`), {
    revalidateOnFocus: false,
  });
  const hub = hubData?.hub;
  useEffect(() => {
    if (hub) rememberHub({ id: hub.id, name: hub.name });
  }, [hub]);

  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [encryptionError, setEncryptionError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<HubThreadMessage | null>(null);
  const [replyTo, setReplyTo] = useState<HubThreadMessage | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const scroller = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const operation = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { data: pages, error: loadError, mutate, size, setSize, isValidating } = useSWRInfinite<Thread>(
    (index, previous: Thread | null) => {
      if (previous && previous.messages.length < PAGE) return null;
      const first = previous?.messages[0];
      const cursor = index && first ? `&before=${encodeURIComponent(first.created_at)}&beforeId=${encodeURIComponent(first.id)}` : '';
      return ['hub-thread', userId, `/api/hub/messages?hubId=${encodeURIComponent(hubId)}&limit=${PAGE}${cursor}`];
    },
    ([, , path]: [string, string, string]) => hubRequest<Thread>(path),
    { refreshInterval: 30_000, shouldRetryOnError: false, revalidateAll: true },
  );
  const data = useMemo(
    () =>
      pages?.[0]
        ? {
            ...pages[0],
            messages: Array.from(new Map(pages.flatMap((p) => p.messages).map((m) => [m.id, m])).values()).sort(
              (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
            ),
            reactions: pages.flatMap((p) => p.reactions ?? []),
          }
        : undefined,
    [pages],
  );
  const visibleIds = useMemo(
    () =>
      data
        ? Array.from(new Set([...data.participant_ids, ...(data.sender_profiles_visible ? data.messages.map((m) => m.user_id) : [])])).sort()
        : [],
    [data],
  );
  const latestId = data?.messages.at(-1)?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el && followLatest.current) el.scrollTop = el.scrollHeight;
  }, [latestId]);

  const { data: people } = useSWR(
    visibleIds.length && !loadError ? ['hub-people', userId, hubId, visibleIds.join(',')] : null,
    async () => {
      const names: Record<string, string> = {};
      for (let i = 0; i < visibleIds.length; i += 100) {
        const r = await hubRequest<{ names: Record<string, string> }>('/api/users/display-names', { userIds: visibleIds.slice(i, i + 100) });
        Object.assign(names, r.names);
      }
      return names;
    },
  );

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    const channel = client
      .channel(`web-hub:${hubId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hub_messages', filter: `hub_id=eq.${hubId}` }, () => void mutate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hub_message_reactions', filter: `hub_id=eq.${hubId}` }, () => void mutate())
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [hubId, mutate]);

  useEffect(() => {
    if (!data || loadError) return;
    let cancelled = false;
    void (async () => {
      let session: Session = null;
      try {
        if (data.messages.some((m) => m.body.startsWith('e2e2:'))) {
          session = await resolveWebHubE2eeV2Session({ hubId, participantUserIds: data.participant_ids, getAuthHeaders: getFreshAuthHeaders });
        }
        const entries = await Promise.all(
          data.messages.map(async (m): Promise<[string, string]> => {
            if (!m.body.startsWith('e2e2:')) return [m.id, m.body];
            try {
              if (!session || parseE2eeV2Envelope(m.body).chatId !== hubId) throw new Error('Unavailable');
              return [m.id, await decryptWebE2eeV2Message(session, m.body)];
            } catch {
              return [m.id, UNAVAILABLE];
            }
          }),
        );
        if (!cancelled) {
          setBodies(Object.fromEntries(entries));
          setEncryptionError('');
        }
      } catch {
        if (!cancelled) {
          setBodies({});
          setEncryptionError('Some encrypted messages can’t be opened on this device yet.');
        }
      } finally {
        zero(session);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, hubId, loadError]);

  async function run(action: () => Promise<void>) {
    if (operation.current || loadError || !data) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      if (mounted.current) await mutate();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const coordsFor = async () => (hub?.event_beacon_id ? {} : await freshHubLocation());

  async function send() {
    if (!data || (!draft.trim() && !file)) return;
    let session: Session = null;
    try {
      const coords = await coordsFor();
      session = await resolveWebHubE2eeV2Session({ hubId, participantUserIds: data.participant_ids, getAuthHeaders: getFreshAuthHeaders });
      const reply = replyTo ? { reply_to_id: replyTo.id } : {};
      if (editing) {
        if (!session && editing.body.startsWith('e2e2:')) throw new Error('Encryption keys are unavailable. Your message wasn’t changed.');
        const encrypted = session ? await encryptWebE2eeV2Message(session, hubId, draft.trim()) : null;
        const previous = editing.metadata && typeof editing.metadata === 'object' ? (editing.metadata as Record<string, unknown>) : {};
        await hubRequest(
          `/api/hub/messages/${encodeURIComponent(editing.id)}`,
          { hub_id: hubId, ...coords, body: encrypted?.wireContent ?? draft.trim(), metadata: { ...previous, ...encrypted?.metadata } },
          'PATCH',
        );
        if (mounted.current) {
          setEditing(null);
          setDraft('');
        }
        return;
      }
      if (file) {
        if (!session) throw new Error('Everyone here needs encryption support before you can share an attachment.');
        const attachment = await uploadHubAttachment({ file, userId, hubId, session, coords });
        await hubRequest('/api/hub/messages', { hub_id: hubId, ...coords, ...attachment, metadata: { ...attachment.metadata, ...reply } });
        if (mounted.current) {
          setFile(null);
          if (fileInput.current) fileInput.current.value = '';
        }
      } else {
        const encrypted = session ? await encryptWebE2eeV2Message(session, hubId, draft.trim()) : null;
        await hubRequest('/api/hub/messages', {
          hub_id: hubId,
          ...coords,
          body: encrypted?.wireContent ?? draft.trim(),
          message_type: 'text',
          metadata: { ...encrypted?.metadata, ...reply },
        });
        if (mounted.current) setDraft('');
      }
      if (mounted.current) {
        setReplyTo(null);
        followLatest.current = true;
      }
    } finally {
      zero(session);
    }
  }

  async function react(message: HubThreadMessage, emoji: string) {
    if (!data) return;
    const coords = await coordsFor();
    const own = data.reactions.some((r) => r.hub_message_id === message.id && r.user_id === userId && r.reaction_type === emoji);
    await hubRequest('/api/hub/reactions', { hub_id: hubId, ...coords, message_id: message.id, reaction_type: emoji }, own ? 'DELETE' : 'POST');
  }

  async function remove(message: HubThreadMessage) {
    const ok = await confirm({ title: 'Delete this message?', message: 'It’s removed for everyone in the hub.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    await run(async () => {
      const coords = await coordsFor();
      await hubRequest(`/api/hub/messages/${encodeURIComponent(message.id)}`, { hub_id: hubId, ...coords }, 'DELETE');
    });
  }

  async function leave() {
    const ok = await confirm({ title: `Leave ${hub?.name ?? 'this hub'}?`, message: 'You can join again while you’re there.', confirmLabel: 'Leave', destructive: true });
    if (!ok) return;
    await run(async () => {
      await hubRequest('/api/hub/leave', { hub_id: hubId });
      forgetHub(hubId);
      if (mounted.current) onBack();
    });
  }

  const bodyFor = (m: HubThreadMessage) => (m.body.startsWith('e2e2:') ? (bodies[m.id] ?? UNAVAILABLE) : m.body);
  const nameFor = (id: string) => (id === userId ? 'You' : visibleIds.includes(id) ? (people?.[id] ?? 'Hub member') : 'Hub member');
  const q = query.trim().toLocaleLowerCase();
  const messages = (data?.messages ?? []).filter((m) => !q || bodyFor(m).toLocaleLowerCase().includes(q));
  const hasOlder = pages?.[pages.length - 1]?.messages.length === PAGE;

  const jumpTo = (id: string) => {
    document.getElementById(`hub-msg-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlight(id);
    window.setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1200);
  };

  const title = hub?.name ?? (hubError ? 'Hub unavailable' : '');
  const subtitle = loadError ? 'Access unavailable' : data ? `${data.occupant_count} here · Hub chat` : 'Hub chat';

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <ChatBackground seed={hubId} />
      <header className="material-glass relative z-10 flex h-16 shrink-0 items-center gap-3 border-b border-hairline px-3 md:px-4">
        <IconButton icon={ArrowLeft} aria-label="Back to Clicks" onClick={onBack} className="md:hidden" />
        <CardVisual seed={hubId} radius="sm" className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="type-body-strong truncate text-fg">{title || <Skeleton className="h-4 w-32" />}</h1>
          <p className="type-meta truncate text-fg-tertiary">{subtitle}</p>
        </div>
        <IconButton icon={Search} aria-label="Search this hub" aria-pressed={searchOpen} onClick={() => setSearchOpen((o) => !o)} />
        <Menu>
          <MenuTrigger asChild>
            <IconButton icon={MoreHorizontal} aria-label="Hub actions" />
          </MenuTrigger>
          <MenuContent align="end" className="w-60">
            {data?.participant_ids.length
              ? data.participant_ids.slice(0, 12).map((id) => (
                  <MenuItem key={id} icon={Users} onSelect={() => router.push(personHref(id))}>
                    {nameFor(id)}
                  </MenuItem>
                ))
              : null}
            {hub?.event_beacon_id ? (
              <MenuItem icon={CalendarDays} onSelect={() => router.push(eventHref(hub.event_beacon_id!))}>
                Event details
              </MenuItem>
            ) : (
              <>
                <MenuSeparator />
                <MenuItem icon={LogOut} destructive disabled={busy || !data} onSelect={() => void leave()}>
                  Leave hub…
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </header>

      <div className="relative z-10 space-y-2 px-3 pt-3 empty:hidden">
        {searchOpen ? (
          <SearchField label="Search loaded messages" value={query} onValueChange={setQuery} autoFocus className="material-glass rounded-md" />
        ) : null}
        {encryptionError ? <InlineNotice variant="warning">{encryptionError}</InlineNotice> : null}
        {error ? (
          <InlineNotice variant="destructive" live>
            {error}
          </InlineNotice>
        ) : null}
      </div>

      <div
        ref={scroller}
        className="chat-thread-scroll relative z-0 min-h-0 flex-1"
        onScroll={() => {
          const el = scroller.current;
          if (el) followLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col justify-end px-3 py-4 md:px-4">
          {hubError || loadError ? (
            <InlineNotice
              variant="destructive"
              action={
                <Button size="sm" variant="plain" onClick={() => void mutate()}>
                  Retry
                </Button>
              }
            >
              {(loadError ?? hubError).message}
            </InlineNotice>
          ) : !data ? (
            <div className="space-y-3" role="status" aria-label="Loading conversation">
              <Skeleton className="h-10 w-2/3 rounded-lg" />
              <Skeleton className="ml-auto h-10 w-1/2 rounded-lg" />
              <Skeleton className="h-10 w-3/5 rounded-lg" />
            </div>
          ) : (
            <>
              {hasOlder ? (
                <div className="flex justify-center pb-3">
                  <Button size="sm" variant="secondary" loading={isValidating} onClick={() => void setSize(size + 1)}>
                    Load older messages
                  </Button>
                </div>
              ) : null}
              {messages.length === 0 ? (
                <p className="type-body m-auto text-center text-fg-secondary">
                  {q ? 'No matching messages in loaded history.' : 'No messages yet. Say hello to the room.'}
                </p>
              ) : null}
              <ol aria-label="Hub messages" className="space-y-[3px]">
                {messages.map((m, i) => {
                  const mine = m.user_id === userId;
                  const body = bodyFor(m);
                  const firstOfRun = messages[i - 1]?.user_id !== m.user_id;
                  const targetId = replyTargetId(m);
                  const target = targetId ? data.messages.find((x) => x.id === targetId) : null;
                  const reactions = data.reactions.filter((r) => r.hub_message_id === m.id);
                  const grouped = Array.from(new Set(reactions.map((r) => r.reaction_type)));
                  return (
                    <li
                      key={m.id}
                      id={`hub-msg-${m.id}`}
                      className={cn(
                        'group/msg relative flex flex-col rounded-md transition-colors duration-[var(--d-base)]',
                        mine ? 'items-end pl-16' : 'items-start pr-16',
                        firstOfRun && i > 0 && 'pt-2',
                        highlight === m.id && 'bg-selection',
                      )}
                    >
                      {!mine && firstOfRun ? (
                        visibleIds.includes(m.user_id) ? (
                          <Link href={personHref(m.user_id)} className="type-meta mb-0.5 px-3 font-semibold text-fg-secondary hover:underline">
                            {nameFor(m.user_id)}
                          </Link>
                        ) : (
                          <span className="type-meta mb-0.5 px-3 font-semibold text-fg-secondary">{nameFor(m.user_id)}</span>
                        )
                      ) : null}
                      <div
                        className={cn(
                          'type-body relative max-w-[min(75%,520px)] whitespace-pre-wrap break-words rounded-bubble px-3 py-2',
                          mine ? 'rounded-br-[6px] bg-bubble-out text-white' : 'rounded-bl-[6px] bg-bubble-in text-fg',
                        )}
                        onDoubleClick={() => void run(() => react(m, '❤️'))}
                      >
                        {target ? (
                          <button
                            type="button"
                            onClick={() => jumpTo(target.id)}
                            className={cn(
                              'mb-1.5 block w-full rounded-sm border-l-[3px] px-2 py-1 text-left',
                              mine ? 'border-white/85 bg-white/15' : 'border-accent bg-fill-subtle',
                            )}
                          >
                            <span className="type-meta block font-semibold">{nameFor(target.user_id)}</span>
                            <span className="type-meta line-clamp-2 opacity-90">{bodyFor(target)}</span>
                          </button>
                        ) : null}
                        {MEDIA_TYPES.has(m.message_type) ? (
                          <HubAttachment message={m} participantIds={data.participant_ids} name={body === UNAVAILABLE ? 'attachment' : body} />
                        ) : (
                          <span className={body === UNAVAILABLE ? 'italic opacity-70' : undefined}>{body}</span>
                        )}
                        <span className={cn('type-badge tabular float-right ml-2 mt-1.5 translate-y-1', mine ? 'text-white/70' : 'text-fg-tertiary')}>
                          {m.edited_at ? 'Edited · ' : ''}
                          {timeLabel(m.created_at)}
                        </span>
                      </div>
                      {grouped.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {grouped.map((emoji) => {
                            const rs = reactions.filter((r) => r.reaction_type === emoji);
                            const minePressed = rs.some((r) => r.user_id === userId);
                            return (
                              <button
                                key={emoji}
                                type="button"
                                disabled={busy}
                                aria-pressed={minePressed}
                                aria-label={`${emoji} ${rs.length}`}
                                onClick={() => void run(() => react(m, emoji))}
                                className={cn(
                                  'type-badge rounded-pill px-2 py-[3px]',
                                  minePressed ? 'bg-selection ring-1 ring-[color-mix(in_srgb,var(--accent)_45%,transparent)]' : 'border border-hairline bg-bubble-in',
                                )}
                              >
                                {emoji}
                                {rs.length > 1 ? ` ${rs.length}` : ''}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          'absolute -top-4 z-10 hidden h-9 items-center gap-0.5 rounded-pill bg-bg-elevated px-1 shadow-overlay group-hover/msg:flex group-focus-within/msg:flex',
                          mine ? 'right-0' : 'left-0',
                        )}
                      >
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            aria-label={`React ${emoji}`}
                            className="press flex size-8 items-center justify-center rounded-full text-xl hover:bg-hover"
                            onClick={() => void run(() => react(m, emoji))}
                          >
                            {emoji}
                          </button>
                        ))}
                        <IconButton size="sm" icon={Reply} aria-label="Reply" onClick={() => setReplyTo(m)} />
                        {mine && m.message_type === 'text' && body !== UNAVAILABLE ? (
                          <IconButton
                            size="sm"
                            icon={Pencil}
                            aria-label="Edit"
                            onClick={() => {
                              setEditing(m);
                              setReplyTo(null);
                              setDraft(body);
                            }}
                          />
                        ) : null}
                        {mine ? <IconButton size="sm" icon={Trash2} aria-label="Delete" onClick={() => void remove(m)} /> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      </div>

      <form
        className="relative z-10 mx-auto w-full max-w-[720px] shrink-0 px-4 pb-4 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(send);
        }}
      >
        {replyTo || editing || file ? (
          <div className="material-glass mb-2 flex items-center gap-3 rounded-md px-3 py-2">
            <span className="h-9 w-[3px] shrink-0 rounded-pill bg-accent" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="type-meta block font-semibold text-fg">
                {editing ? 'Editing message' : file ? 'Attachment' : `Replying to ${nameFor(replyTo!.user_id)}`}
              </span>
              <span className="type-meta block truncate text-fg-secondary">{file ? file.name : bodyFor((editing ?? replyTo)!)}</span>
            </span>
            <IconButton
              size="sm"
              icon={X}
              aria-label="Cancel"
              onClick={() => {
                if (editing) setDraft('');
                setEditing(null);
                setReplyTo(null);
                setFile(null);
                if (fileInput.current) fileInput.current.value = '';
              }}
            />
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <IconButton
            variant="glass"
            icon={Paperclip}
            aria-label="Attach a file (under 25 MB)"
            disabled={busy || !!editing}
            onClick={() => fileInput.current?.click()}
          />
          <input ref={fileInput} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <label className="sr-only" htmlFor="hub-composer">
            Message {title}
          </label>
          <textarea
            id="hub-composer"
            value={draft}
            maxLength={4000}
            rows={1}
            disabled={busy || !data || !!loadError}
            placeholder={`Message ${title || 'the hub'}…`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void run(send);
              } else if (e.key === 'Escape') {
                if (editing) setDraft('');
                setEditing(null);
                setReplyTo(null);
              }
            }}
            className="material-glass type-body field-sizing-content max-h-[176px] min-h-10 flex-1 resize-none rounded-bubble border border-hairline px-3.5 py-2.5 text-fg placeholder:text-fg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
          />
          <IconButton
            type="submit"
            variant="action"
            icon={editing ? Check : ArrowUp}
            aria-label={editing ? 'Save edit' : 'Send'}
            disabled={busy || !data || !!loadError || (!draft.trim() && !file)}
          />
        </div>
      </form>
      {confirmNode}
    </div>
  );
}
