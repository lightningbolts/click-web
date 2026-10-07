import { CalendarDays, Home, MapPin, MessageCircle, Store, type LucideIcon } from 'lucide-react';

export type AppNavId = 'home' | 'clicks' | 'map' | 'events' | 'business';

export type AppNavItem = { id: AppNavId; label: string; href: string; icon: LucideIcon };

const ITEMS: AppNavItem[] = [
  { id: 'home', label: 'Home', href: '/', icon: Home },
  { id: 'clicks', label: 'Clicks', href: '/clicks', icon: MessageCircle },
  { id: 'map', label: 'Map', href: '/map', icon: MapPin },
  { id: 'events', label: 'Events', href: '/events', icon: CalendarDays },
  { id: 'business', label: 'Business', href: '/business', icon: Store },
];

/** Top-bar items (spec §6.1). Business appears only for Place managers. */
export function appNavItems({ managesPlaces }: { managesPlaces: boolean }): AppNavItem[] {
  return managesPlaces ? ITEMS : ITEMS.filter((i) => i.id !== 'business');
}

/** Which top-level section a path belongs to. */
export function activeAppSection(pathname: string): AppNavId | 'add' | 'me' | null {
  if (pathname === '/' || pathname === '/dashboard') return 'home';
  if (pathname.startsWith('/clicks') || pathname.startsWith('/people/')) return 'clicks';
  if (pathname.startsWith('/map')) return 'map';
  if (pathname.startsWith('/events') || pathname.startsWith('/e/')) return 'events';
  if (pathname.startsWith('/business') || pathname.startsWith('/insights')) return 'business';
  if (pathname.startsWith('/add')) return 'add';
  if (pathname.startsWith('/me') || pathname.startsWith('/settings') || pathname.startsWith('/activity')) return 'me';
  return null;
}

/**
 * Pushed screens where the mobile tab bar steps aside (spec §6.2): a chat thread, creation and
 * edit forms, the camera.
 */
export function hidesTabBar(pathname: string): boolean {
  return (
    isThreadPath(pathname) ||
    pathname === '/events/new' ||
    /^\/e\/[^/]+\/(edit|manage|recap|scan)/.test(pathname)
  );
}

/** Same-origin path only (spec §7.11). */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}

export function loginHref(next?: string | null): string {
  const path = safeNextPath(next ?? null, '');
  return path && path !== '/' ? `/login?next=${encodeURIComponent(path)}` : '/login';
}

/** A 1:1 Click thread (spec §6.3). */
export function threadHref(connectionId: string): string {
  return `/clicks/c/${encodeURIComponent(connectionId)}`;
}

/** A verified group thread (spec §6.3). */
export function groupThreadHref(groupId: string): string {
  return `/clicks/g/${encodeURIComponent(groupId)}`;
}

/** A community hub thread (spec §6.3). */
export function hubThreadHref(hubId: string): string {
  return `/clicks/h/${encodeURIComponent(hubId)}`;
}

/** Full-screen thread routes: no mobile top or tab bar, the thread header carries Back. */
export function isThreadPath(pathname: string): boolean {
  return /^\/clicks\/[cgh]\/[^/]+/.test(pathname);
}

/** Someone you've met (spec §7.3). */
export function personHref(userId: string): string {
  return `/people/${encodeURIComponent(userId)}`;
}

export function eventHref(eventId: string): string {
  return `/e/${encodeURIComponent(eventId)}`;
}
