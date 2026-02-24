"use client";

import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import {
  Zap,
  RefreshCw,
  Download,
  Settings,
  LayoutDashboard,
  Activity,
  MapPin,
  Users2,
  MessageSquare,
  Radio,
  ChevronLeft,
  LogOut,
} from "lucide-react";

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
    href: "/insights/live-metrics",
    label: "Live Metrics",
    icon: Radio,
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
  venueName = "The Neon Lounge",
}: BusinessInsightsShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
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
    <div className="min-h-screen bg-[#121212] text-white relative">
      {/* Ambient background gradients */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#8338EC]/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#3A86FF]/10 rounded-full blur-[128px]" />
      </div>

      {/* Sticky business insights nav */}
      <div className="sticky top-0 z-50 bg-[#121212]/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-[1800px] mx-auto px-4 md:px-6 lg:px-8">
          {/* Header row */}
          <div className="flex items-center justify-between py-3 md:py-4">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{
                  boxShadow: isLive
                    ? [
                        "0 0 20px rgba(131, 56, 236, 0.4)",
                        "0 0 35px rgba(131, 56, 236, 0.7)",
                        "0 0 20px rgba(131, 56, 236, 0.4)",
                      ]
                    : "0 0 0px rgba(131, 56, 236, 0)",
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="relative p-2.5 bg-[#8338EC]/20 rounded-xl border border-[#8338EC]/30 flex-shrink-0"
              >
                <Zap className="w-4 h-4 md:w-5 md:h-5 text-[#8338EC]" />
                {isLive && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                )}
              </motion.div>

              <div>
                <h1 className="text-base md:text-lg font-bold leading-tight">
                  <span className="bg-gradient-to-r from-white via-white to-zinc-400 bg-clip-text text-transparent">
                    Click Insights
                  </span>
                </h1>
                <p className="text-[10px] md:text-xs text-zinc-500 leading-tight">
                  {venueName} &bull; {isLive ? "Live" : "Offline"} Dashboard
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* Back to dashboard */}
              <Link
                href="/dashboard"
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
              >
                <ChevronLeft className="w-3 h-3" />
                Dashboard
              </Link>

              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    isLive ? "bg-green-500 animate-pulse" : "bg-zinc-500"
                  }`}
                />
                <span className="text-xs text-zinc-400">
                  Updated {formatLastUpdated(lastUpdated)}
                </span>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRefresh}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors group"
                title="Refresh data"
              >
                <RefreshCw className="w-3.5 h-3.5 md:w-4 md:h-4 text-zinc-400 group-hover:text-white transition-colors" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors group"
                title="Export data"
              >
                <Download className="w-3.5 h-3.5 md:w-4 md:h-4 text-zinc-400 group-hover:text-white transition-colors" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="hidden md:flex p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors group"
                title="Settings"
              >
                <Settings className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
              </motion.button>

              {user && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSignOut}
                  className="p-2 bg-white/5 hover:bg-red-500/20 hover:border-red-500/30 rounded-xl border border-white/10 transition-colors group"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5 md:w-4 md:h-4 text-zinc-400 group-hover:text-red-400 transition-colors" />
                </motion.button>
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
                  className={`relative flex items-center gap-1.5 px-3 md:px-4 py-2.5 text-xs md:text-sm font-medium rounded-t-xl whitespace-nowrap transition-all duration-200 ${
                    active
                      ? "text-white bg-white/5"
                      : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{label}</span>
                  {active && (
                    <motion.div
                      layoutId="insights-nav-indicator"
                      className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#8338EC] rounded-full"
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
        <div className="max-w-[1800px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
