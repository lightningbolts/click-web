"use client";

import { useState, useCallback, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import {
  RefreshCw,
  Download,
  Settings,
  LayoutDashboard,
  Activity,
  MapPin,
  Users2,
  MessageSquare,
  Radio,
  Radar,
  CalendarDays,
  Sparkles,
  LayoutGrid,
} from "lucide-react";
import { useInsightsDemo } from "@/components/insights/InsightsDemoContext";
import VenueBroadcastingModule from "@/components/insights/VenueBroadcastingModule";
import ProductAppShell from "@/components/shell/ProductAppShell";
import { displayNameFromUserMetadata } from "@/lib/userDisplayName";

const NAV_ITEMS = [
  { id: "overview", href: "/insights", label: "Overview", icon: LayoutDashboard, exact: true },
  {
    id: "social-activity",
    href: "/insights/social-activity",
    label: "Social Activity",
    icon: Activity,
    exact: false,
  },
  { id: "heatmap", href: "/insights/heatmap", label: "Heatmap", icon: MapPin, exact: false },
  {
    id: "tribes",
    href: "/insights/tribes",
    label: "Tribe Analysis",
    icon: Users2,
    exact: false,
  },
  {
    id: "vibe-stream",
    href: "/insights/vibe-stream",
    label: "Vibe Stream",
    icon: MessageSquare,
    exact: false,
  },
  {
    id: "vibe-radar",
    href: "/insights/vibe-radar",
    label: "Vibe Radar",
    icon: Radar,
    exact: false,
  },
  {
    id: "live-metrics",
    href: "/insights/live-metrics",
    label: "Live Metrics",
    icon: Radio,
    exact: false,
  },
  {
    id: "events",
    href: "/insights/events",
    label: "Events",
    icon: CalendarDays,
    exact: false,
  },
  {
    id: "event-engagement",
    href: "/insights/event-engagement",
    label: "Event engagement",
    icon: CalendarDays,
    exact: false,
  },
];

interface BusinessInsightsShellProps {
  children: ReactNode;
  venueName?: string;
}

/**
 * BusinessInsightsShell — vertical product chrome for /insights.
 * Shares ProductAppShell with the personal dashboard.
 */
export default function BusinessInsightsShell({
  children,
  venueName = "Insights",
}: BusinessInsightsShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const insightsVenueId = searchParams.get("venue_id")?.trim() || null;
  const { user, signOut, profileImageUrl } = useAuth();
  const { demoMode, setDemoMode } = useInsightsDemo();
  const [isLive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const formatLastUpdated = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return date.toLocaleTimeString();
  };

  const handleRefresh = useCallback(() => {
    setLastUpdated(new Date());
    router.refresh();
  }, [router]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const withVenue = (href: string) =>
    insightsVenueId ? `${href}?venue_id=${encodeURIComponent(insightsVenueId)}` : href;

  const userLabel =
    displayNameFromUserMetadata(user?.user_metadata) || user?.email?.split("@")[0] || null;

  return (
    <ProductAppShell
      productLabel="Click Insights"
      productHref={withVenue("/insights")}
      items={NAV_ITEMS.map((item) => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
        href: withVenue(item.href),
        exact: item.exact,
      }))}
      title="Click Insights"
      subtitle={`${venueName} · ${isLive ? "Live" : "Offline"} dashboard`}
      extraNav={[{ href: "/", label: "Dashboard", icon: LayoutGrid }]}
      userLabel={userLabel}
      userAvatarUrl={profileImageUrl}
      onSignOut={handleSignOut}
      actions={
        <>
          <button
            type="button"
            onClick={() => setDemoMode(!demoMode)}
            title={
              demoMode
                ? "Turn off sample data — show live insights only"
                : "Fill empty insights with sample data (demo)"
            }
            aria-label={
              demoMode
                ? "Turn off demo data"
                : "Turn on demo data"
            }
            className={`flex items-center gap-1.5 rounded-[8px] border-2 px-2.5 py-2 text-xs font-bold md:px-3 ${
              demoMode
                ? "border-border-hard bg-primary-container text-on-primary-container"
                : "border-border-hard bg-surface text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{demoMode ? "Demo on" : "Demo data"}</span>
          </button>
          <div className="hidden items-center gap-2 rounded-[8px] border border-border-hard bg-surface px-3 py-1.5 md:flex">
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                isLive ? "animate-pulse bg-primary" : "bg-outline"
              }`}
            />
            <span className="text-xs font-medium text-on-surface-variant">
              Updated {formatLastUpdated(lastUpdated)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-[8px] border border-border-hard bg-surface p-2 hover:bg-surface-container-low"
            title="Refresh data"
            aria-label="Refresh data"
          >
            <RefreshCw className="h-3.5 w-3.5 text-on-surface-variant md:h-4 md:w-4" />
          </button>
          <button
            type="button"
            className="rounded-[8px] border border-border-hard bg-surface p-2 hover:bg-surface-container-low"
            title="Export data"
            aria-label="Export data"
          >
            <Download className="h-3.5 w-3.5 text-on-surface-variant md:h-4 md:w-4" />
          </button>
          <button
            type="button"
            className="hidden rounded-[8px] border border-border-hard bg-surface p-2 hover:bg-surface-container-low md:flex"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4 text-on-surface-variant" />
          </button>
        </>
      }
    >
      <div className="mx-auto max-w-[1800px] space-y-6">
        {pathname === "/insights/vibe-radar" && insightsVenueId ? (
          <VenueBroadcastingModule venueId={insightsVenueId} />
        ) : null}
        {children}
      </div>
    </ProductAppShell>
  );
}
