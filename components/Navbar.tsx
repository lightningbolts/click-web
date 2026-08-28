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

const navItemClass =
  "inline-flex h-9 items-center rounded-[8px] px-3 text-sm font-semibold leading-none";

function navLinkClass(active: boolean) {
  return cn(
    navItemClass,
    active ? "text-primary" : "text-on-surface hover:bg-surface-container-low hover:text-secondary",
  );
}

const navControlClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-border-hard bg-surface px-3 text-sm font-semibold leading-none text-on-surface hover:bg-surface-container-low";

const navCtaClass =
  "fc-btn-primary h-9 shrink-0 whitespace-nowrap px-4 text-sm leading-none";

export default function Navbar() {
  const { user, signOut, loading } = useAuth();
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
        <div className="mx-auto grid max-w-6xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
          <Link
            href="/"
            className="order-1 flex shrink-0 items-center gap-2 justify-self-start text-xl font-bold md:gap-2.5 md:text-2xl"
          >
            <ClickLogo size={28} className="h-7 w-7 md:h-8 md:w-8" priority />
            <span>
              <span className="text-primary">C</span>
              <span className="text-on-surface">lick</span>
            </span>
          </Link>

          <div className="order-2 hidden min-w-0 items-center justify-self-center md:flex">
            <Link href="/events" className={navLinkClass(pathname === "/events" || pathname.startsWith("/e/"))}>
              Events
            </Link>
            {user ? (
              <Link href="/" className={navLinkClass(pathname === "/" || pathname === "/dashboard")}>
                Dashboard
              </Link>
            ) : null}
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

          <div className="order-3 flex shrink-0 items-center justify-self-end gap-2">
            <ThemeToggle />

            {loading && !user ? (
              <div data-testid="nav-auth-loading" className={navCtaClass} aria-hidden>
                <span className="invisible">Login</span>
              </div>
            ) : user ? (
              <>
                <Link href="/events/new" className={cn(navCtaClass, "hidden md:inline-flex")}>
                  <Plus className="block size-4 shrink-0" aria-hidden />
                  Create event
                </Link>
                <div className="relative" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((o) => !o)}
                    className={navControlClass}
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                  >
                    <User className="block size-4 shrink-0" aria-hidden />
                    <span className="hidden max-w-[160px] truncate sm:inline">{userLabel}</span>
                    <ChevronDown className="block size-4 shrink-0" aria-hidden />
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
                className={navCtaClass}
              >
                Login
              </button>
            )}

            <div className="relative md:hidden" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMobileOpen((o) => !o)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-border-hard text-on-surface hover:bg-surface-container-low"
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
                  {user ? (
                    <Link
                      href="/"
                      onClick={() => setMobileOpen(false)}
                      className="block rounded-[8px] px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container"
                    >
                      Dashboard
                    </Link>
                  ) : null}
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
