'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import UserProfileModal from '@/components/UserProfileModal';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { getSupabaseClient } from '@/lib/supabase';
import { freshHubLocation, hubRequest } from '@/lib/hub/client';
import type { HubThreadMessage } from '@/lib/hub/hubThread';
import { parseE2eeV2Envelope } from '@/lib/chat/e2eeV2';
import { uploadHubAttachment } from '@/lib/hub/mediaClient';
import { decryptWebE2eeV2Message, encryptWebE2eeV2Message, resolveWebHubE2eeV2Session } from '@/lib/chat/e2eeV2Client';
import HubAttachment from './HubAttachment';
import type { CommunityHub } from './CommunityHubs';

type Reaction = { id: string; hub_message_id: string; user_id: string; reaction_type: string };
type Thread = { messages: HubThreadMessage[]; reactions?: Reaction[]; participant_ids: string[]; occupant_count: number; sender_profiles_visible?: boolean };
const button = 'rounded-xl border-2 border-border-hard px-4 py-2 text-sm font-semibold disabled:opacity-50';
const unavailable = 'Encrypted message unavailable on this device';

export default function HubConversation({ hub, userId, onBack }: { hub: CommunityHub; userId: string; onBack: () => void }) {
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [displayBodies, setDisplayBodies] = useState<Record<string, string>>({});
  const [encryptionError, setEncryptionError] = useState('');
  const [query, setQuery] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<HubThreadMessage | null>(null);
  const threadList = useRef<HTMLOListElement>(null);
  const followLatest = useRef(true);
  const operation = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const { data: pages, error: loadError, mutate, size, setSize, isValidating } = useSWRInfinite<Thread>(
    (index, previous: Thread | null) => {
      if (previous && previous.messages.length < 120) return null;
      const cursor = index && previous?.messages[0] ? `&before=${encodeURIComponent(previous.messages[0].created_at)}&beforeId=${encodeURIComponent(previous.messages[0].id)}` : '';
      return ['hub-thread', userId, `/api/hub/messages?hubId=${encodeURIComponent(hub.id)}&limit=120${cursor}`];
    },
    ([, , path]: [string, string, string]) => hubRequest<Thread>(path),
    { refreshInterval: 30_000, shouldRetryOnError: false, revalidateAll: true });
  const data = useMemo(() => pages?.[0] ? {
    ...pages[0],
    messages: Array.from(new Map(pages.flatMap((page) => page.messages).map((message) => [message.id, message])).values())
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
    reactions: pages.flatMap((page) => page.reactions ?? []),
  } : undefined, [pages]);
  const visibleIds = useMemo(() => data ? Array.from(new Set([
    ...data.participant_ids, ...(data.sender_profiles_visible ? data.messages.map((message) => message.user_id) : []),
  ])).sort() : [], [data]);
  const latestMessageId = data?.messages.at(-1)?.id;
  useEffect(() => {
    const list = threadList.current;
    if (list && followLatest.current) list.scrollTop = list.scrollHeight;
  }, [latestMessageId]);
  const { data: people } = useSWR(visibleIds.length && !loadError ? ['hub-people', userId, hub.id, visibleIds.join(',')] : null,
    async () => {
      const names: Record<string, string> = {};
      for (let i = 0; i < visibleIds.length; i += 100) {
        const result = await hubRequest<{ names: Record<string, string> }>('/api/users/display-names', { userIds: visibleIds.slice(i, i + 100) });
        Object.assign(names, result.names);
      }
      return names;
    });
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    const channel = client.channel(`web-hub:${hub.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hub_messages', filter: `hub_id=eq.${hub.id}` }, () => { void mutate(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hub_message_reactions', filter: `hub_id=eq.${hub.id}` }, () => { void mutate(); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [hub.id, mutate]);
  useEffect(() => {
    if (!data || loadError) return;
    let cancelled = false;
    async function decrypt() {
      let session: Awaited<ReturnType<typeof resolveWebHubE2eeV2Session>> = null;
      try {
        if (data!.messages.some((m) => m.body.startsWith('e2e2:'))) {
          session = await resolveWebHubE2eeV2Session({ hubId: hub.id, participantUserIds: data!.participant_ids, getAuthHeaders: getFreshAuthHeaders });
        }
        const entries = await Promise.all(data!.messages.map(async (message): Promise<[string, string]> => {
          if (!message.body.startsWith('e2e2:')) return [message.id, message.body];
          try {
            if (!session || parseE2eeV2Envelope(message.body).chatId !== hub.id) throw new Error('Unavailable');
            return [message.id, await decryptWebE2eeV2Message(session, message.body)];
          } catch { return [message.id, unavailable]; }
        }));
        if (!cancelled) { setDisplayBodies(Object.fromEntries(entries)); setEncryptionError(''); }
      } catch {
        if (!cancelled) { setDisplayBodies({}); setEncryptionError('Some encrypted messages cannot be opened on this device yet.'); }
      } finally { session?.epochKeys.forEach((key) => key.fill(0)); }
    }
    void decrypt();
    return () => { cancelled = true; };
  }, [data, hub.id, loadError]);

  async function run(action: () => Promise<void>) {
    if (operation.current || loadError || !data) return;
    operation.current = true; setBusy(true); setError('');
    try { await action(); if (mounted.current) await mutate(); }
    catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  async function send() {
    if (!data || (!draft.trim() && !file)) return;
    let session: Awaited<ReturnType<typeof resolveWebHubE2eeV2Session>> = null;
    try {
      const coords = hub.event_beacon_id ? {} : await freshHubLocation();
      session = await resolveWebHubE2eeV2Session({ hubId: hub.id, participantUserIds: data.participant_ids, getAuthHeaders: getFreshAuthHeaders });
      if (file) {
        if (!session) throw new Error('All participants need encryption support before you can share an attachment.');
        const attachment = await uploadHubAttachment({ file, userId, hubId: hub.id, session, coords });
        await hubRequest('/api/hub/messages', { hub_id: hub.id, ...coords, ...attachment, metadata: { ...attachment.metadata, ...(replyTo ? { reply_to_id: replyTo.id } : {}) } });
        if (mounted.current) { setFile(null); if (fileInput.current) fileInput.current.value = ''; }
      } else {
        const encrypted = session ? await encryptWebE2eeV2Message(session, hub.id, draft.trim()) : null;
        await hubRequest('/api/hub/messages', { hub_id: hub.id, ...coords, body: encrypted?.wireContent ?? draft.trim(), message_type: 'text', metadata: { ...encrypted?.metadata, ...(replyTo ? { reply_to_id: replyTo.id } : {}) } });
        if (mounted.current) setDraft('');
      }
      if (mounted.current) { setReplyTo(null); followLatest.current = true; }
    } finally { session?.epochKeys.forEach((key) => key.fill(0)); }
  }
  async function act(kind: 'edit' | 'delete' | 'react', message: HubThreadMessage, reactionType = '') {
    if (!data) return;
    let session: Awaited<ReturnType<typeof resolveWebHubE2eeV2Session>> = null;
    try {
      const coords = hub.event_beacon_id ? {} : await freshHubLocation();
      const payload = { hub_id: hub.id, ...coords };
      if (kind === 'react') {
        const own = data.reactions.some((r) => r.hub_message_id === message.id && r.user_id === userId && r.reaction_type === reactionType);
        await hubRequest('/api/hub/reactions', { ...payload, message_id: message.id, reaction_type: reactionType }, own ? 'DELETE' : 'POST');
      } else if (kind === 'delete') {
        await hubRequest(`/api/hub/messages/${encodeURIComponent(message.id)}`, payload, 'DELETE');
        if (mounted.current) setDeleting(null);
      } else {
        if (!editBody.trim()) return;
        session = await resolveWebHubE2eeV2Session({ hubId: hub.id, participantUserIds: data.participant_ids, getAuthHeaders: getFreshAuthHeaders });
        if (!session && message.body.startsWith('e2e2:')) throw new Error('Encryption keys are unavailable. Your message was not changed.');
        const encrypted = session ? await encryptWebE2eeV2Message(session, hub.id, editBody.trim()) : null;
        const previous = message.metadata && typeof message.metadata === 'object' ? message.metadata as Record<string, unknown> : {};
        await hubRequest(`/api/hub/messages/${encodeURIComponent(message.id)}`, { ...payload, body: encrypted?.wireContent ?? editBody.trim(), metadata: { ...previous, ...encrypted?.metadata } }, 'PATCH');
        if (mounted.current) setEditing(null);
      }
    } finally { session?.epochKeys.forEach((key) => key.fill(0)); }
  }
  const bodyFor = (message: HubThreadMessage) => message.body.startsWith('e2e2:') ? displayBodies[message.id] ?? unavailable : message.body;
  const replyLabel = (message: HubThreadMessage) => {
    const meta = message.metadata && typeof message.metadata === 'object' ? message.metadata as Record<string, unknown> : {};
    if (typeof meta.reply_to_id !== 'string') return null;
    const target = data?.messages.find((row) => row.id === meta.reply_to_id);
    return target ? bodyFor(target) : 'Earlier message';
  };
  const filtered = data?.messages.filter((message) => bodyFor(message).toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];

  return <section className="fc-card space-y-4 rounded-2xl p-5">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={button} onClick={onBack}>Back to hubs</button>
      <div className="flex-1"><h2 className="text-xl font-bold">{hub.name}</h2><p className="text-sm text-on-surface-variant">{loadError ? 'Access unavailable' : `${data?.occupant_count ?? '…'} participants`}</p></div>
      {hub.event_beacon_id ? <Link className={button} href={`/e/${encodeURIComponent(hub.event_beacon_id)}`}>Event details</Link> : <button type="button" disabled={busy || !data || !!loadError} className={button} onClick={() => void run(async () => { await hubRequest('/api/hub/leave', { hub_id: hub.id }); if (mounted.current) onBack(); })}>Leave hub</button>}
    </div>
    <p className="text-xs text-on-surface-variant">Hub encryption depends on participant device support. Older messages may require your original device.</p>
    {data && !loadError ? <>
      <label className="block text-sm">Search loaded messages<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 block w-full rounded-xl border-2 border-border-hard bg-background p-2" /></label>
      <p className="text-xs text-on-surface-variant">Search stays on this device. Load older messages to search more history.</p>
      {data.participant_ids.length ? <details><summary className="cursor-pointer font-semibold">Participants</summary><ul className="flex flex-wrap gap-3 py-3">{data.participant_ids.map((id) => <li key={id}><button type="button" className="underline" onClick={() => setProfileId(id)}>{id === userId ? 'You' : people?.[id] ?? 'Hub member'}</button></li>)}</ul></details> : null}
      {pages?.[pages.length - 1]?.messages.length === 120 ? <button type="button" className={button} disabled={isValidating} onClick={() => void setSize(size + 1)}>{isValidating ? 'Loading…' : 'Load older messages'}</button> : null}
    </> : null}
    {loadError ? <p role="alert">{loadError.message} <button type="button" className="underline" onClick={() => void mutate()}>Retry</button></p> : !data ? <p role="status">Loading conversation…</p> : <ol ref={threadList} onScroll={() => { const list = threadList.current; if (list) followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80; }} className="max-h-[55dvh] space-y-3 overflow-y-auto" aria-label="Hub messages">
      {!filtered.length ? <li>{query ? 'No matching messages in loaded history.' : 'No messages yet. Say hello to the room.'}</li> : null}
      {filtered.map((message) => <li key={message.id} className={`rounded-xl border-2 border-border-hard p-3 ${message.user_id === userId ? 'bg-primary/10' : 'bg-surface'}`}>
        <p className="mb-1 text-xs text-on-surface-variant">{visibleIds.includes(message.user_id) ? <button type="button" className="underline" onClick={() => setProfileId(message.user_id)}>{message.user_id === userId ? 'You' : people?.[message.user_id] ?? 'Hub member'}</button> : 'Hub member'} · {new Date(message.created_at).toLocaleString()}</p>
        {replyLabel(message) ? <blockquote className="mb-2 truncate border-l-2 border-primary pl-3 text-sm text-on-surface-variant">Reply to: {replyLabel(message)}</blockquote> : null}
        <p className="whitespace-pre-wrap break-words">{bodyFor(message)}</p>
        {['image', 'audio', 'file', 'video'].includes(message.message_type) ? <HubAttachment message={message} participantIds={data.participant_ids} name={bodyFor(message) === unavailable ? 'attachment' : bodyFor(message)} /> : null}
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Message actions">
          <button type="button" disabled={busy} className="px-2 text-sm underline" onClick={() => setReplyTo(message)}>Reply</button>
          {Array.from(new Set(['❤️', '👍', '😂', ...data.reactions.filter((r) => r.hub_message_id === message.id).map((r) => r.reaction_type)])).map((emoji) => {
            const reactions = data.reactions.filter((r) => r.hub_message_id === message.id && r.reaction_type === emoji);
            return <button key={emoji} type="button" disabled={busy} aria-label={`React ${emoji}`} aria-pressed={reactions.some((r) => r.user_id === userId)} className="rounded-lg border border-border-hard px-2 py-1 text-sm aria-pressed:bg-primary/20" onClick={() => void run(() => act('react', message, emoji))}>{emoji} {reactions.length || ''}</button>;
          })}
          {message.user_id === userId ? <>
            {message.message_type === 'text' && bodyFor(message) !== unavailable ? <button type="button" disabled={busy} className="px-2 text-sm underline" onClick={() => { setEditing(message.id); setEditBody(bodyFor(message)); }}>Edit</button> : null}
            <button type="button" disabled={busy} className="px-2 text-sm underline" onClick={() => setDeleting(message.id)}>Delete</button>
          </> : null}
        </div>
        {deleting === message.id ? <div className="mt-2 flex flex-wrap items-center gap-3"><span>Delete this message?</span><button type="button" disabled={busy} className={button} onClick={() => void run(() => act('delete', message))}>Delete message</button><button type="button" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button></div> : null}
        {editing === message.id ? <form className="mt-3 space-y-2" onSubmit={(event) => { event.preventDefault(); void run(() => act('edit', message)); }}><label className="block">Edit message<textarea value={editBody} maxLength={4000} disabled={busy} onChange={(event) => setEditBody(event.target.value)} className="block w-full rounded-xl border-2 border-border-hard bg-background p-2" /></label><button className={button} disabled={busy || !editBody.trim()}>Save changes</button><button type="button" className={button} disabled={busy} onClick={() => setEditing(null)}>Cancel</button></form> : null}
        {message.edited_at ? <span className="text-xs text-on-surface-variant">Edited</span> : null}
      </li>)}
    </ol>}
    {profileId && !loadError ? <UserProfileModal userId={profileId} currentUserId={userId} getAuthHeaders={getFreshAuthHeaders} onClose={() => setProfileId(null)} /> : null}
    {encryptionError ? <p role="status" className="text-sm">{encryptionError}</p> : null}
    {error ? <p role="alert" className="text-sm">{error}</p> : null}
    {replyTo ? <div className="flex items-center gap-3 rounded-xl border-2 border-border-hard p-3"><p className="min-w-0 flex-1 truncate text-sm">Replying to: {bodyFor(replyTo)}</p><button type="button" disabled={busy} onClick={() => setReplyTo(null)} className="text-sm underline">Cancel reply</button></div> : null}
    <form className="flex items-end gap-3" onSubmit={(event) => { event.preventDefault(); void run(send); }}>
      <label className="flex-1 text-sm">Message<textarea value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy} maxLength={4000} rows={3} className="mt-1 block w-full resize-y rounded-xl border-2 border-border-hard bg-background p-3" /></label>
      <button disabled={busy || !data || !!loadError || (!draft.trim() && !file)} className={`${button} bg-primary text-white`}>{busy ? 'Please wait…' : file ? 'Send attachment' : 'Send'}</button>
    </form>
    <label className="block text-sm">Attach a file (under 25 MiB)<input ref={fileInput} type="file" disabled={busy} className="mt-1 block max-w-full" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
  </section>;
}
