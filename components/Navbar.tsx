"use client";

import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import UserProfile from "@/components/UserProfile";
import { useEffect, useRef, useState } from "react";
import LoginModal from "@/components/LoginModal";
import ThemeToggle from "@/components/ThemeToggle";
import { usePathname, useRouter } from "next/navigation";
import { User, LogOut, BarChart2, Menu, X } from "lucide-react";
import { displayNameFromUserMetadata } from "@/lib/userDisplayName";
import useSWR from "swr";
import { fetchInsightsApiJson } from "@/lib/insights/fetchInsightsApi";

type InsightsAccessPayload = { insightsAllowed: boolean };

const insightsAccessFetcher = (url: string) =>
  fetchInsightsApiJson<InsightsAccessPayload>(url);

export default function Navbar() {
  const { user, signOut } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: insightsAccess } = useSWR(
    user ? "/api/user/insights-access" : null,
    insightsAccessFetcher,
  );

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  if (pathname.startsWith("/insights")) return null;

  const isLoggedInView =
    user && (pathname === "/" || pathname === "/dashboard");

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      router.push("/");
      router.refresh();
    }
  };

  const scrollToMission = () => {
    setMobileOpen(false);
    const missionSection = document.getElementById("mission");
    if (missionSection) {
      missionSection.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = "/#mission";
    }
  };

  return (
    <>
      <nav
        data-navbar-root="true"
        className="relative z-[99999] border-b-2 border-border-hard bg-surface px-4 py-4 text-on-surface md:px-12 md:py-5"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="shrink-0 text-xl font-bold md:text-2xl">
            <span className="text-primary">C</span>
            <span className="text-on-surface">lick</span>
          </Link>

          <div className="flex items-center gap-2 md:gap-4">
            <ThemeToggle />

            {isLoggedInView ? (
              <>
                {insightsAccess?.insightsAllowed ? (
                  <Link
                    href="/insights"
                    className="fc-btn-secondary flex items-center gap-1 whitespace-nowrap px-2 py-2 text-xs md:gap-2 md:px-4 md:text-sm"
                  >
                    <BarChart2 className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="hidden sm:inline">Insights</span>
                  </Link>
                ) : null}
                <div className="hidden items-center gap-2 text-sm font-medium text-on-surface-variant sm:flex">
                  <User className="h-4 w-4 shrink-0" />
                  <span className="max-w-[200px] truncate">
                    {displayNameFromUserMetadata(user?.user_metadata) || user?.email}
                  </span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="fc-btn-secondary flex items-center gap-1 whitespace-nowrap px-2 py-2 text-xs hover:border-error hover:text-error md:gap-2 md:px-4 md:text-sm"
                >
                  <LogOut className="h-3 w-3 md:h-4 md:w-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <>
                {/* Desktop links */}
                <div className="hidden items-center gap-4 md:flex">
                  <button
                    type="button"
                    onClick={scrollToMission}
                    className="text-sm font-semibold text-on-surface hover:text-primary"
                  >
                    Mission
                  </button>
                  <Link
                    href="/enterprise"
                    className="text-sm font-semibold text-on-surface hover:text-primary"
                  >
                    Enterprise
                  </Link>
                  <Link
                    href="/about"
                    className="text-sm font-semibold text-on-surface hover:text-primary"
                  >
                    About
                  </Link>
                </div>

                {user ? (
                  <UserProfile />
                ) : (
                  <button
                    onClick={() => setIsLoginOpen(true)}
                    className="fc-btn-secondary px-3 py-2 text-xs md:px-4 md:text-sm"
                  >
                    Login
                  </button>
                )}

                {/* Mobile menu toggle */}
                <div className="relative md:hidden" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMobileOpen((o) => !o)}
                    className="rounded-[8px] border-2 border-border-hard p-2 text-on-surface"
                    aria-expanded={mobileOpen}
                    aria-label={mobileOpen ? "Close menu" : "Open menu"}
                  >
                    {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                  </button>
                  {mobileOpen ? (
                    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-48 rounded-[12px] border-2 border-border-hard bg-surface p-2 shadow-lg">
                      <button
                        type="button"
                        onClick={scrollToMission}
                        className="block w-full rounded-[8px] px-3 py-2.5 text-left text-sm font-semibold text-on-surface hover:bg-surface-container"
                      >
                        Mission
                      </button>
                      <Link
                        href="/enterprise"
                        onClick={() => setMobileOpen(false)}
                        className="block rounded-[8px] px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container"
                      >
                        Enterprise
                      </Link>
                      <Link
                        href="/about"
                        onClick={() => setMobileOpen(false)}
                        className="block rounded-[8px] px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container"
                      >
                        About
                      </Link>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </nav>
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </>
  );
}
