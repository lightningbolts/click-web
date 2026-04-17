/**
 * GET /api/users/[userId]/profile
 * Returns joined profile for a user (respects RLS — typically connections only).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import {
  normalizeAvailabilityIntentRows,
  normalizeLegacyAvailabilityRecord,
  type AvailabilityIntentRow,
} from '@/lib/userProfile/availability';
import { getSharedInterestTags } from '@/lib/userProfile/sharedInterests';

function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

/** Trimmed display strings (legacy / dual-write) and deduped lowercase names for `interests.name`. */
function parseProfileTagsInput(raw: unknown[]): { legacy: string[]; normalizedUnique: string[] } {
  const legacy: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (t.length === 0) continue;
    legacy.push(t);
  }
  const seen = new Set<string>();
  const normalizedUnique: string[] = [];
  for (const t of legacy) {
    const n = t.toLowerCase();
    if (seen.has(n)) continue;
    seen.add(n);
    normalizedUnique.push(n);
  }
  return { legacy, normalizedUnique };
}

/**
 * Upsert master interests, replace `user_interest_links` for this user.
 * Order: upsert `interests` → delete links → insert links.
 */
async function syncUserInterestNormalization(
  supabase: SupabaseClient,
  userId: string,
  normalizedUniqueNames: string[],
): Promise<{ error: string | null }> {
  try {
    let idByName: Map<string, string> | null = null;

    if (normalizedUniqueNames.length > 0) {
      const { data: interestRows, error: upErr } = await supabase
        .from('interests')
        .upsert(
          normalizedUniqueNames.map((name) => ({ name })),
          { onConflict: 'name' },
        )
        .select('id, name');

      if (upErr) return { error: upErr.message };
      if (!interestRows?.length) {
        return { error: 'interest upsert returned no rows' };
      }

      idByName = new Map(
        (interestRows as { id: string; name: string }[]).map((r) => [r.name, r.id]),
      );
      for (const n of normalizedUniqueNames) {
        if (!idByName.has(n)) {
          return { error: `missing interest row for "${n}"` };
        }
      }
    }

    const { error: delErr } = await supabase
      .from('user_interest_links')
      .delete()
      .eq('user_id', userId);
    if (delErr) return { error: delErr.message };

    if (normalizedUniqueNames.length > 0 && idByName) {
      const rows = normalizedUniqueNames.map((name) => ({
        user_id: userId,
        interest_id: idByName.get(name)!,
      }));
      const { error: insErr } = await supabase.from('user_interest_links').insert(rows);
      if (insErr) return { error: insErr.message };
    }

    return { error: null };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export type AvailabilityIntentPayload = AvailabilityIntentRow;

function extractAvailabilityIntentsFromClaims(
  authUser: { app_metadata?: unknown; user_metadata?: unknown } | null | undefined,
  targetUserId: string,
): AvailabilityIntentRow[] {
  if (!authUser) return [];

  const candidates: unknown[] = [];
  const appMeta = isJsonObject(authUser.app_metadata) ? authUser.app_metadata : null;
  const userMeta = isJsonObject(authUser.user_metadata) ? authUser.user_metadata : null;

  if (appMeta) {
    candidates.push(appMeta);
    if (isJsonObject(appMeta.claims)) candidates.push(appMeta.claims);
    if (isJsonObject(appMeta.custom_claims)) candidates.push(appMeta.custom_claims);
  }
  if (userMeta) {
    candidates.push(userMeta);
    if (isJsonObject(userMeta.claims)) candidates.push(userMeta.claims);
    if (isJsonObject(userMeta.custom_claims)) candidates.push(userMeta.custom_claims);
  }

  const tryNormalize = (value: unknown): AvailabilityIntentRow[] => {
    if (Array.isArray(value)) return normalizeAvailabilityIntentRows(value);
    if (!isJsonObject(value)) return [];

    const direct = value.availability_intents ?? value.availabilityIntents;
    if (Array.isArray(direct)) return normalizeAvailabilityIntentRows(direct);

    const byUser = value.by_user ?? value.users ?? value.user_ids;
    if (isJsonObject(byUser)) {
      const scoped = byUser[targetUserId];
      if (Array.isArray(scoped)) return normalizeAvailabilityIntentRows(scoped);
    }

    const keyed = value[targetUserId];
    if (Array.isArray(keyed)) return normalizeAvailabilityIntentRows(keyed);
    return [];
  };

  for (const c of candidates) {
    const rows = tryNormalize(c);
    if (rows.length > 0) return rows;
  }

  return [];
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;
  if (!userId?.trim()) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [userRes, interestsRes, availRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, first_name, last_name, name, full_name, birthday, image, email')
        .eq('id', userId)
        .maybeSingle(),
      supabase.from('user_interests').select('tags').eq('user_id', userId).maybeSingle(),
      supabase.from('user_availability').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    const profileTags = (interestsRes.data as { tags?: string[] } | null)?.tags ?? [];

    let availabilityIntents = extractAvailabilityIntentsFromClaims(user, userId);
    if (availabilityIntents.length === 0) {
      try {
        const admin = createAdminClient();
        const { data: intentRows, error: intentErr } = await admin
          .from('availability_intents')
          .select('id, timeframe, intent_tag, expires_at')
          .eq('user_id', userId)
          .gt('expires_at', new Date().toISOString())
          .order('expires_at', { ascending: true });

        if (!intentErr && intentRows) {
          availabilityIntents = normalizeAvailabilityIntentRows(intentRows);
        } else if (intentErr) {
          console.warn('profile availability_intents:', intentErr.message);
        }
      } catch (e) {
        console.warn('profile availability_intents fetch failed:', e);
      }
    }

    let viewerInterestTags: string[] = [];
    let sharedInterestTags: string[] = [];
    if (user.id !== userId) {
      const { data: myRow } = await supabase
        .from('user_interests')
        .select('tags')
        .eq('user_id', user.id)
        .maybeSingle();
      viewerInterestTags = (myRow as { tags?: string[] } | null)?.tags ?? [];
      sharedInterestTags = getSharedInterestTags(viewerInterestTags, profileTags);
    }

    if (userRes.error) {
      return NextResponse.json({ error: userRes.error.message }, { status: 500 });
    }
    if (!userRes.data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    let sharedConnection: Record<string, unknown> | null = null;
    if (user.id !== userId) {
      // Full edge row + all `connection_encounters` (newest first). The web profile uses the latest
      // crossing for the summary card and the full list for the timeline — same source of truth as the app.
      const { data: mutualRows, error: mutualErr } = await supabase
        .from('connections')
        .select('*, connection_encounters(*)')
        .contains('user_ids', [user.id, userId])
        .order('encountered_at', { ascending: false, referencedTable: 'connection_encounters' });
      if (mutualErr) {
        console.warn('profile mutual connection:', mutualErr.message);
      } else if (mutualRows && mutualRows.length > 0) {
        type ConnRow = { created?: number; last_message_at?: number | null };
        const best = (mutualRows as ConnRow[]).reduce((a, b) => {
          const ta = Math.max(a.last_message_at ?? 0, a.created ?? 0);
          const tb = Math.max(b.last_message_at ?? 0, b.created ?? 0);
          return tb >= ta ? b : a;
        });
        sharedConnection = best as Record<string, unknown>;
      }
    }

    return NextResponse.json({
      user: userRes.data,
      tags: profileTags,
      availability: normalizeLegacyAvailabilityRecord(availRes.data ?? null),
      availabilityIntents,
      viewerInterestTags,
      sharedInterestTags,
      sharedConnection,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load profile';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function isJsonObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * PATCH /api/users/[userId]/profile
 * Updates `public.users` (and optionally `user_interests.tags`) for the signed-in user only.
 * When `tags` is sent, also normalizes into `interests` + `user_interest_links` and dual-writes `users.tags`.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;
  if (!userId?.trim()) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const { user, supabase, authError } = await getSupabaseFromRouteRequest(req);
  if (authError != null || user == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!isJsonObject(parsed)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }
  const body = parsed;

  const updates: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(body, 'first_name')) {
    if (typeof body.first_name !== 'string') {
      return NextResponse.json({ error: 'first_name must be a string' }, { status: 400 });
    }
    const f = body.first_name.trim();
    if (f.length === 0) {
      return NextResponse.json({ error: 'first_name cannot be empty' }, { status: 400 });
    }
    updates.first_name = f;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'last_name')) {
    if (typeof body.last_name !== 'string') {
      return NextResponse.json({ error: 'last_name must be a string' }, { status: 400 });
    }
    updates.last_name = body.last_name.trim();
  }
  if (typeof body.full_name === 'string') {
    const t = body.full_name.trim();
    if (t.length > 0) updates.full_name = t;
  }
  if (typeof body.name === 'string') {
    const t = body.name.trim();
    if (t.length > 0) updates.name = t;
  }
  if (typeof body.image === 'string') {
    const t = body.image.trim();
    if (t.length > 0) updates.image = t;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'first_name') && typeof body.first_name === 'string') {
    const f = (updates.first_name as string) ?? body.first_name.trim();
    let l: string;
    if (typeof updates.last_name === 'string') {
      l = updates.last_name;
    } else if (typeof body.last_name === 'string') {
      l = body.last_name.trim();
    } else {
      // Fetch the existing last_name so auto-derived display name doesn't drop it
      const { data: currentRow } = await supabase
        .from('users')
        .select('last_name')
        .eq('id', userId)
        .maybeSingle();
      l = (currentRow as { last_name?: string } | null)?.last_name ?? '';
    }
    const display = [f, l].filter((s) => s.length > 0).join(' ');
    if (!Object.prototype.hasOwnProperty.call(body, 'full_name')) {
      updates.full_name = display;
    }
    if (!Object.prototype.hasOwnProperty.call(body, 'name')) {
      updates.name = display;
    }
  }

  let tags: string[] | null = null;
  let tagsNormalizedUnique: string[] | null = null;
  if (Object.prototype.hasOwnProperty.call(body, 'tags')) {
    if (!Array.isArray(body.tags)) {
      return NextResponse.json({ error: 'tags must be an array of strings' }, { status: 400 });
    }
    const { legacy, normalizedUnique } = parseProfileTagsInput(body.tags);
    tags = legacy;
    tagsNormalizedUnique = normalizedUnique;
    updates.tags = legacy;
  }

  if (Object.keys(updates).length === 0 && tags == null) {
    return NextResponse.json(
      {
        error:
          'No supported fields to update. Provide first_name, last_name, full_name, name, image, and/or tags.',
      },
      { status: 400 },
    );
  }

  try {
    if (tags != null && tagsNormalizedUnique != null) {
      const { error: normErr } = await syncUserInterestNormalization(
        supabase,
        userId,
        tagsNormalizedUnique,
      );
      if (normErr) {
        console.error('users profile PATCH interest normalization:', normErr);
        return NextResponse.json({ error: 'Interest normalization failed' }, { status: 500 });
      }
    }

    const persistTasks = [];
    if (Object.keys(updates).length > 0) {
      persistTasks.push(supabase.from('users').update(updates).eq('id', userId));
    }
    if (tags != null) {
      persistTasks.push(
        supabase.from('user_interests').upsert(
          {
            user_id: userId,
            tags,
            updated_at: Date.now(),
          },
          { onConflict: 'user_id' },
        ),
      );
    }
    if (persistTasks.length > 0) {
      const results = await Promise.all(persistTasks);
      for (const r of results) {
        if (r.error) {
          console.error('users profile PATCH:', r.error.message);
          return NextResponse.json({ error: r.error.message }, { status: 500 });
        }
      }
    }

    const { data: userRow, error: readErr } = await supabase
      .from('users')
      .select('id, first_name, last_name, name, full_name, birthday, image, email')
      .eq('id', userId)
      .maybeSingle();

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }
    if (!userRow) {
      return NextResponse.json({ error: 'User row not found' }, { status: 404 });
    }

    return NextResponse.json({ user: userRow });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to update profile';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
