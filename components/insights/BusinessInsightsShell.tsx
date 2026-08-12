"use client";

import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
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
  ChevronLeft,
  LogOut,
  Sparkles,
} from "lucide-react";
import { useInsightsDemo } from "@/components/insights/InsightsDemoContext";
import VenueBroadcastingModule from "@/components/insights/VenueBroadcastingModule";
import ThemeToggle from "@/components/ThemeToggle";
import ClickLogo from "@/components/ClickLogo";

const navItems = [
  { href: "/insights", label: "Overview", icon: LayoutDashboard, exact: true },
  {
    href: "/insights/social-activity",
    label: "Social Activity",
    icon: Activity,
    exact: false,
  },
  { href: "/insights/heatmap", label: "Heatmap", icon: MapPin, exact: false },
  {
    href: "/insights/tribes",
    label: "Tribe Analysis",
    icon: Users2,
    exact: false,
  },
  {
    href: "/insights/vibe-stream",
    label: "Vibe Stream",
    icon: MessageSquare,
    exact: false,
  },
  {
    href: "/insights/vibe-radar",
    label: "Vibe Radar",
    icon: Radar,
    exact: false,
  },
  {
    href: "/insights/live-metrics",
    label: "Live Metrics",
    icon: Radio,
    exact: false,
  },
  {
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
 * BusinessInsightsShell — sticky header + sub-navigation for the /insights section.
 * Analogous to the personal Navbar but scoped to business analytics.
 */
export default function BusinessInsightsShell({
  children,
  venueName = "Insights",
}: BusinessInsightsShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const insightsVenueId = searchParams.get("venue_id")?.trim() || null;
  const { user, signOut } = useAuth();
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

  const isActive = (href: string, exact: boolean) =>
    exact
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="relative min-h-screen bg-background text-on-surface">
      {/* Sticky business insights nav */}
      <div
        className="sticky top-0 z-50 border-b border-border-hard bg-surface"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="mx-auto max-w-[1800px] px-4 md:px-6 lg:px-8">
          {/* Header row */}
          <div className="flex items-center justify-between py-3 md:py-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <ClickLogo
                  variant="boxed"
                  size={40}
                  className="h-10 w-10 rounded-[8px] border border-border-hard"
                  priority
                />
                {isLive && (
                  <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                  </span>
                )}
              </div>

              <div>
                <h1 className="text-base font-bold leading-tight text-on-surface md:text-lg">
                  Click Insights
                </h1>
                <p className="text-[10px] font-medium leading-tight text-on-surface-variant md:text-xs">
                  {venueName} &bull; {isLive ? "Live" : "Offline"} Dashboard
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setDemoMode(!demoMode)}
                title={
                  demoMode
                    ? "Turn off sample data — show live insights only"
                    : "Fill empty insights with sample data (demo)"
                }
                className={`flex items-center gap-1.5 rounded-[8px] border-2 px-2.5 py-2 text-xs font-bold md:px-3 ${
                  demoMode
                    ? "border-border-hard bg-on-primary-container text-primary"
                    : "border-border-hard bg-surface text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">
                  {demoMode ? "Demo on" : "Demo data"}
                </span>
              </button>

              {/* Back to dashboard */}
              <Link
                href="/"
                className="fc-btn-secondary hidden items-center gap-1.5 px-3 py-1.5 text-xs md:flex"
              >
                <ChevronLeft className="h-3 w-3" />
                Dashboard
              </Link>

              <div className="hidden items-center gap-2 rounded-[8px] border border-border-hard bg-surface px-3 py-1.5 md:flex">
                <div
                  className={`h-1.5 w-1.5 rounded-full ${
                    isLive ? "animate-pulse bg-green-500" : "bg-outline"
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
              >
                <RefreshCw className="h-3.5 w-3.5 text-on-surface-variant md:h-4 md:w-4" />
              </button>

              <button
                type="button"
                className="rounded-[8px] border border-border-hard bg-surface p-2 hover:bg-surface-container-low"
                title="Export data"
              >
                <Download className="h-3.5 w-3.5 text-on-surface-variant md:h-4 md:w-4" />
              </button>

              <button
                type="button"
                className="hidden rounded-[8px] border border-border-hard bg-surface p-2 hover:bg-surface-container-low md:flex"
                title="Settings"
              >
                <Settings className="h-4 w-4 text-on-surface-variant" />
              </button>

              {user && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-[8px] border border-border-hard bg-surface p-2 hover:border-error hover:text-error"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5 text-on-surface-variant md:h-4 md:w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-0.5 overflow-x-auto pb-0 scrollbar-none -mx-1 px-1">
            {navItems.map(({ href, label, icon: Icon, exact }) => {
              const active = isActive(href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-t-[8px] px-3 py-2.5 text-xs font-bold transition-colors md:px-4 md:text-sm ${
                    active
                      ? "bg-on-primary-container text-primary"
                      : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{label}</span>
                  {active && (
                    <motion.div
                      layoutId="insights-nav-indicator"
                      className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 30,
                      }}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Page content */}
      <main className="relative p-4 md:p-6 lg:p-8">
        <div className="max-w-[1800px] mx-auto space-y-6">
          {pathname === "/insights/vibe-radar" && insightsVenueId ? (
            <VenueBroadcastingModule venueId={insightsVenueId} />
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
