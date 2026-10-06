import type { ManagerPlace } from '@/lib/server/places/serialize';

/** Last-used Place for `/business` (spec §9.2); set by middleware on workspace visits. */
export const BIZ_PLACE_COOKIE = 'click_biz_place';

export type PlaceRole = ManagerPlace['role'];

/** Owners and managers write; viewers only read (spec §9.4). */
export function canWrite(role: PlaceRole): boolean {
  return role === 'owner' || role === 'manager';
}

export type PlaceStatusPill = { label: string; variant: 'neutral' | 'warning' | 'tinted' | 'success' | 'destructive' };

/** The workspace status pill (spec §9.4 table). */
export function placeStatusPill(place: Pick<ManagerPlace, 'verification_status' | 'listed'>): PlaceStatusPill {
  switch (place.verification_status) {
    case 'pending':
      return { label: 'In review', variant: 'warning' };
    case 'verified':
      return place.listed ? { label: 'Live', variant: 'success' } : { label: 'Verified · Not listed', variant: 'tinted' };
    case 'suspended':
      return { label: 'Suspended', variant: 'destructive' };
    default:
      return { label: 'Draft', variant: 'neutral' };
  }
}

/** Resolves `/business` to a Place: the cookie's (if still managed) else the first by name. */
export function resolveBusinessPlace(places: Pick<ManagerPlace, 'id'>[], cookiePlaceId: string | null | undefined): string | null {
  if (places.length === 0) return null;
  return places.find((p) => p.id === cookiePlaceId)?.id ?? places[0].id;
}

export const INSIGHTS_SECTIONS = ['traffic', 'crowd', 'vibe', 'events'] as const;
export type InsightsSection = 'overview' | (typeof INSIGHTS_SECTIONS)[number];

/** `?to=insights/traffic` after resolving (spec §9.2): only known workspace paths pass. */
export function safeWorkspaceSuffix(to: string | null | undefined): string {
  if (!to) return '';
  const clean = to.replace(/^\/+|\/+$/g, '');
  const ok =
    ['events', 'insights', 'profile', 'qr', 'team', 'billing'].includes(clean) ||
    INSIGHTS_SECTIONS.some((s) => clean === `insights/${s}`);
  return ok ? `/${clean}` : '';
}
