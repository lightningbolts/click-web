import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/withAuth';
import { parseBody } from '@/lib/api/parseBody';
import { apiError } from '@/lib/api/errors';
import { contactsDiscoverBodySchema } from '@/lib/api/schemas/connections';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import {
  MAX_DISCOVER_HASHES,
  SHA256_HEX_RE,
  isPairBlocked,
} from '@/lib/connections/priorConnections';

export type DiscoverProfileCard = {
  id: string;
  name: string;
  avatar_url: string | null;
  tags: string[];
};

/** A contact you already have a connection with: established, or a request either way. */
export type KnownContactCard = DiscoverProfileCard & { status: 'connected' | 'pending' };

/**
 * POST /api/contacts/discover
 *
 * Match SHA-256 phone/email hashes (computed on-device) against registered
 * users. Never accepts or returns plaintext contacts. Contacts you already have a
 * connection with are left out of `matches` and listed in `known` instead, so the app
 * can show who they are rather than "none of your contacts are on Click". The counts
 * (`already_connected`, `pending`) stay for older apps.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, contactsDiscoverBodySchema);
  if (!parsed.ok) return parsed.response;

  const hashes = Array.from(
    new Set(
      parsed.data.hashed_contacts
        .map((h) => h.trim().toLowerCase())
        .filter((h) => SHA256_HEX_RE.test(h)),
    ),
  ).slice(0, MAX_DISCOVER_HASHES);

  if (hashes.length === 0) {
    return NextResponse.json({ matches: [] as DiscoverProfileCard[] });
  }

  const admin = createAdminClient();
  const { data: hashRows, error: hashErr } = await admin
    .from('user_contact_hashes')
    .select('hash, user_id')
    .in('hash', hashes);

  if (hashErr) {
    console.error('[contacts/discover] hash lookup:', hashErr.message);
    return apiError('Failed to match contacts', 500, 'discover_failed');
  }

  const candidateIds = Array.from(
    new Set(
      (hashRows ?? [])
        .map((row) => (typeof row.user_id === 'string' ? row.user_id.trim() : ''))
        .filter((id) => id.length > 0 && id !== auth.user.id),
    ),
  );

  if (candidateIds.length === 0) {
    return NextResponse.json({ matches: [], known: [], already_connected: 0, pending: 0 });
  }

  const { data: existingPairs, error: pairErr } = await admin
    .from('connections')
    .select('id, user_ids, status')
    .contains('user_ids', [auth.user.id]);
  if (pairErr) {
    console.error('[contacts/discover] connections:', pairErr.message);
    return apiError('Failed to match contacts', 500, 'discover_failed');
  }

  const alreadyConnected = new Set<string>();
  const pendingWith = new Set<string>();
  for (const row of existingPairs ?? []) {
    const ids = Array.isArray(row.user_ids) ? row.user_ids : [];
    const status = typeof row.status === 'string' ? row.status : '';
    if (status === 'removed') continue;
    const target = status === 'pending' ? pendingWith : alreadyConnected;
    for (const id of ids) {
      if (typeof id === 'string' && id !== auth.user.id) target.add(id);
    }
  }

  const visibleIds: string[] = [];
  const knownStatus = new Map<string, KnownContactCard['status']>();
  for (const id of candidateIds) {
    if (alreadyConnected.has(id)) knownStatus.set(id, 'connected');
    else if (pendingWith.has(id)) knownStatus.set(id, 'pending');
    else if (!(await isPairBlocked(admin, auth.user.id, id))) visibleIds.push(id);
  }
  const statuses = Array.from(knownStatus.values());
  const counts = {
    already_connected: statuses.filter((s) => s === 'connected').length,
    pending: statuses.filter((s) => s === 'pending').length,
  };

  const profileIds = [...visibleIds, ...knownStatus.keys()];
  if (profileIds.length === 0) {
    return NextResponse.json({ matches: [], known: [], ...counts });
  }

  const { data: users, error: usersErr } = await admin
    .from('users')
    .select('id, name, first_name, last_name, full_name, image')
    .in('id', profileIds);
  if (usersErr) {
    console.error('[contacts/discover] users:', usersErr.message);
    return apiError('Failed to match contacts', 500, 'discover_failed');
  }

  const { data: interestRows, error: interestErr } = await admin
    .from('user_interests')
    .select('user_id, tags')
    .in('user_id', profileIds);
  if (interestErr) {
    console.warn('[contacts/discover] interests:', interestErr.message);
  }

  const tagsByUser = new Map<string, string[]>();
  for (const row of interestRows ?? []) {
    const uid = typeof row.user_id === 'string' ? row.user_id : '';
    const tags = Array.isArray(row.tags)
      ? row.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : [];
    if (uid) tagsByUser.set(uid, tags);
  }

  const cards: DiscoverProfileCard[] = (users ?? [])
    .map((row) => {
      const id = typeof row.id === 'string' ? row.id : '';
      const first = typeof row.first_name === 'string' ? row.first_name.trim() : '';
      const last = typeof row.last_name === 'string' ? row.last_name.trim() : '';
      const named = [first, last].filter(Boolean).join(' ');
      const name =
        named ||
        (typeof row.full_name === 'string' && row.full_name.trim()) ||
        (typeof row.name === 'string' && row.name.trim()) ||
        'Member';
      const avatar =
        typeof row.image === 'string' && row.image.trim() ? row.image.trim() : null;
      return {
        id,
        name,
        avatar_url: avatar,
        tags: tagsByUser.get(id) ?? [],
      };
    })
    .filter((card) => card.id.length > 0);

  const matches: DiscoverProfileCard[] = [];
  const known: KnownContactCard[] = [];
  for (const card of cards) {
    const status = knownStatus.get(card.id);
    if (status) known.push({ ...card, status });
    else matches.push(card);
  }

  return NextResponse.json({ matches, known, ...counts });
}
