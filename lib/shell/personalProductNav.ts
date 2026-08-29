import {
  BookOpen,
  CalendarDays,
  MapPin,
  MessageCircle,
  QrCode,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export const DASHBOARD_TABS = [
  'memory',
  'events',
  'map',
  'chat',
  'identity',
  'settings',
] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

const TAB_SET = new Set<string>(DASHBOARD_TABS);

export function parseDashboardTab(raw: string | null | undefined): DashboardTab {
  if (raw && TAB_SET.has(raw)) return raw as DashboardTab;
  return 'memory';
}

export function dashboardTabHref(tab: DashboardTab): string {
  if (tab === 'events') return '/events';
  return `/?tab=${tab}`;
}

const NAV: { id: DashboardTab; label: string; icon: LucideIcon }[] = [
  { id: 'memory', label: 'Memory Box', icon: BookOpen },
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'map', label: 'Map', icon: MapPin },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'identity', label: 'QR Identity', icon: QrCode },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function personalProductNavItems(): {
  id: DashboardTab;
  label: string;
  icon: LucideIcon;
  href: string;
}[] {
  return NAV.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    href: dashboardTabHref(item.id),
  }));
}

/** Routes where the signed-in Navbar shows product tabs instead of marketing links. */
export function isSignedInProductPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/dashboard' ||
    pathname.startsWith('/events') ||
    pathname.startsWith('/e/')
  );
}

export function productNavItemIsActive(
  item: { id: DashboardTab; href: string },
  pathname: string,
  tab: string | null | undefined,
): boolean {
  if (item.id === 'events') {
    return pathname === '/events' || pathname.startsWith('/events/') || pathname.startsWith('/e/');
  }
  if (pathname !== '/' && pathname !== '/dashboard') return false;
  return parseDashboardTab(tab) === item.id;
}
