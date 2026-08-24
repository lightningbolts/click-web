"use client";

import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { useEffect, useRef, useState } from "react";
import LoginModal from "@/components/LoginModal";
import ThemeToggle from "@/components/ThemeToggle";
import ClickLogo from "@/components/ClickLogo";
import { usePathname, useRouter } from "next/navigation";
import { User, LogOut, BarChart2, Menu, X, ChevronDown, LayoutDashboard, CalendarDays, Plus } from "lucide-react";
import { displayNameFromUserMetadata } from "@/lib/userDisplayName";
import useSWR from "swr";
import { fetchInsightsApiJson } from "@/lib/insights/fetchInsightsApi";
import { cn } from "@/lib/cn";

type InsightsAccessPayload = { insightsAllowed: boolean };

const insightsAccessFetcher = (url: string) =>
  fetchInsightsApiJson<InsightsAccessPayload>(url);

function navLinkClass(active: boolean) {
  return cn(
    "rounded-[8px] px-3 py-2 text-sm font-semibold transition-colors",
    active
      ? "bg-primary-container text-on-primary-container"
      : "text-on-surface hover:bg-surface-container-low hover:text-secondary",
  );
}

export default function Navbar() {
  const { user, signOut } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { data: insightsAccess } = useSWR(
    user ? "/api/user/insights-access" : null,
    insightsAccessFetcher,
  );

  const isProductRoute =
    pathname.startsWith("/insights") ||
    Boolean(user && (pathname === "/" || pathname === "/dashboard"));

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen && !userMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMobileOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setUserMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen, userMenuOpen]);

  if (isProductRoute) return null;

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

  const scrollToHowItWorks = () => {
    setMobileOpen(false);
    const section = document.getElementById("how-it-works");
    if (section) {
      section.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = "/#how-it-works";
    }
  };

  const userLabel = displayNameFromUserMetadata(user?.user_metadata) || user?.email || "Account";

  return (
    <>
      <nav
        data-navbar-root="true"
        className="relative z-[99999] border-b border-border-hard bg-surface px-4 py-3 text-on-surface md:px-10 md:py-4"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 text-xl font-bold md:gap-2.5 md:text-2xl"
          >
            <ClickLogo size={28} className="h-7 w-7 md:h-8 md:w-8" priority />
            <span>
              <span className="text-primary">C</span>
              <span className="text-on-surface">lick</span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            <Link href="/events" className={navLinkClass(pathname === "/events" || pathname.startsWith("/e/"))}>
              Events
            </Link>
            <button type="button" onClick={scrollToHowItWorks} className={navLinkClass(false)}>
              How it works
            </button>
            <Link href="/enterprise" className={navLinkClass(pathname === "/enterprise")}>
              Enterprise
            </Link>
            <Link href="/about" className={navLinkClass(pathname === "/about")}>
              About
            </Link>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <ThemeToggle />

            {user ? (
              <>
                <Link
                  href="/"
                  className="hidden items-center gap-1.5 text-sm font-semibold text-on-surface hover:text-secondary sm:inline-flex"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
                <Link href="/events/new" className="fc-btn-primary hidden whitespace-nowrap px-3 py-2 text-xs md:inline-flex md:px-4 md:text-sm">
                  <Plus className="h-3.5 w-3.5" />
                  Create event
                </Link>
                <div className="relative" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((o) => !o)}
                    className="fc-btn-secondary flex items-center gap-2 px-2 py-2 text-xs md:px-3 md:text-sm"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                  >
                    <User className="h-4 w-4 shrink-0" />
                    <span className="hidden max-w-[160px] truncate sm:inline">{userLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {userMenuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-52 rounded-[12px] border border-border-hard bg-surface p-2"
                    >
                      <Link
                        href="/"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 rounded-[8px] px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                      </Link>
                      <Link
                        href="/events"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 rounded-[8px] px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container"
                      >
                        <CalendarDays className="h-4 w-4" />
                        Events
                      </Link>
                      {insightsAccess?.insightsAllowed ? (
                        <Link
                          href="/insights"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 rounded-[8px] px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container"
                        >
                          <BarChart2 className="h-4 w-4" />
                          Insights
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleSignOut}
                        data-testid="nav-sign-out"
                        className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left text-sm font-semibold text-on-surface hover:bg-surface-container hover:text-error"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <button
                onClick={() => setIsLoginOpen(true)}
                data-testid="nav-login"
                className="fc-btn-primary px-3 py-2 text-xs md:px-4 md:text-sm"
              >
                Login
              </button>
            )}

            <div className="relative md:hidden" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMobileOpen((o) => !o)}
                className="rounded-[8px] border border-border-hard p-2 text-on-surface"
                aria-expanded={mobileOpen}
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
              >
                {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
              {mobileOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-52 rounded-[12px] border border-border-hard bg-surface p-2">
                  <Link
                    href="/events"
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-[8px] px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container"
                  >
                    Events
                  </Link>
                  <Link
                    href="/events/new"
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-[8px] px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container"
                  >
                    Create event
                  </Link>
                  <button
                    type="button"
                    onClick={scrollToHowItWorks}
                    className="block w-full rounded-[8px] px-3 py-2.5 text-left text-sm font-semibold text-on-surface hover:bg-surface-container"
                  >
                    How it works
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
          </div>
        </div>
      </nav>
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </>
  );
}
