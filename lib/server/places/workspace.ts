import 'server-only';

import { cache } from 'react';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { getServerUser } from '@/lib/server/getServerUser';
import { PLACE_COLUMNS, type PlaceRow } from '@/lib/server/places/loadPlace';
import { serializeManagerPlace, type ManagerPlace } from '@/lib/server/places/serialize';
import { placeHasInsights } from '@/lib/server/places/entitlement';

export { BIZ_PLACE_COOKIE } from '@/lib/places/workspace';

import type { PlaceRole } from '@/lib/places/workspace';

export type { PlaceRole };

export type ManagedPlace = ManagerPlace & {
  /** Paid Insights for this Place (active or trialing). */
  entitled: boolean;
  /** Raw columns the billing page needs; never sent to viewers. */
  stripe: { customerId: string | null; subscriptionId: string | null } | null;
};

type JoinRow = { role: PlaceRole; places: (PlaceRow & { stripe_customer_id?: string | null; stripe_subscription_id?: string | null }) | null };

function toManaged(row: JoinRow): ManagedPlace | null {
  const place = Array.isArray(row.places) ? row.places[0] : row.places;
  if (!place) return null;
  return {
    ...serializeManagerPlace(place, row.role),
    entitled: placeHasInsights(place),
    stripe:
      row.role === 'owner'
        ? { customerId: place.stripe_customer_id ?? null, subscriptionId: place.stripe_subscription_id ?? null }
        : null,
  };
}

const SELECT = `role, places!inner(${PLACE_COLUMNS}, stripe_customer_id, stripe_subscription_id)`;

/** Every Place the user manages, by name (the switcher, `/business/places`, the resolver). */
export const loadManagedPlaces = cache(async (userId: string): Promise<ManagedPlace[]> => {
  const { data, error } = await createAdminSupabaseClient().from('place_managers').select(SELECT).eq('user_id', userId);
  if (error) throw new Error(`managed places: ${error.message}`);
  return ((data ?? []) as unknown as JoinRow[])
    .map(toManaged)
    .filter((p): p is ManagedPlace => p != null)
    .sort((a, b) => a.name.localeCompare(b.name));
});

/** One managed Place with the caller's role, or null when they don't manage it (spec §9.3). */
export const loadManagerPlace = cache(async (placeId: string, userId: string): Promise<ManagedPlace | null> => {
  const { data, error } = await createAdminSupabaseClient()
    .from('place_managers')
    .select(SELECT)
    .eq('user_id', userId)
    .eq('place_id', placeId)
    .maybeSingle();
  if (error) throw new Error(`manager place: ${error.message}`);
  return data ? toManaged(data as unknown as JoinRow) : null;
});

export type WorkspaceContext =
  | { kind: 'signed-out' }
  | { kind: 'not-manager' }
  | { kind: 'ok'; userId: string; email: string | null; place: ManagedPlace; places: ManagedPlace[] };

/** The workspace guard, shared by the layout and every tab page in one request. */
export const loadWorkspace = cache(async (placeId: string): Promise<WorkspaceContext> => {
  const user = await getServerUser();
  if (!user) return { kind: 'signed-out' };
  const [place, places] = await Promise.all([loadManagerPlace(placeId, user.id), loadManagedPlaces(user.id)]);
  if (!place) return { kind: 'not-manager' };
  return { kind: 'ok', userId: user.id, email: user.email ?? null, place, places };
});

/** What client components may receive: never the Stripe ids. */
export function toWorkspacePlace({ stripe: _stripe, ...place }: ManagedPlace): Omit<ManagedPlace, 'stripe'> {
  void _stripe;
  return place;
}
