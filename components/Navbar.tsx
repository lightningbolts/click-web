"use client";

import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { useEffect, useRef, useState } from "react";
import LoginModal from "@/components/LoginModal";
import ThemeToggle from "@/components/ThemeToggle";
import ClickLogo from "@/components/ClickLogo";
import MobileNavDrawer from "@/components/shell/MobileNavDrawer";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { User, LogOut, BarChart2, Menu, X, ChevronDown, Plus } from "lucide-react";
import { displayNameFromUserMetadata } from "@/lib/userDisplayName";
import useSWR from "swr";
import { fetchInsightsApiJson } from "@/lib/insights/fetchInsightsApi";
import { cn } from "@/lib/cn";
import { PAGE_COLUMN_CLASS } from "@/lib/shell/pageColumn";
import {
  personalProductNavItems,
  productNavItemIsActive,
} from "@/lib/shell/personalProductNav";

type InsightsAccessPayload = { insightsAllowed: boolean };

const insightsAccessFetcher = (url: string) =>
  fetchInsightsApiJson<InsightsAccessPayload>(url);

const navItemClass =
  "inline-flex h-9 items-center rounded-[8px] px-3 text-sm font-semibold leading-none";

function navLinkClass(active: boolean) {
  return cn(
    navItemClass,
    active ? "text-primary" : "text-on-surface hover:bg-surface-container-low hover:text-primary",
  );
}

const navControlClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-border-hard bg-surface px-3 text-sm font-semibold leading-snug text-on-surface hover:bg-surface-container-low";

const navCtaClass =
  "fc-btn-primary h-9 shrink-0 whitespace-nowrap px-4 text-sm leading-none";

const drawerLinkClass =
  "flex items-center gap-2 rounded-[8px] px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container";

export default function Navbar({
  initialHasSession = false,
}: {
  initialHasSession?: boolean;
}) {
  const { user, signOut, loading } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const userMenuRef = useRef<HTMLDivElement>(null);
  const tab = searchParams.get("tab");

  const { data: insightsAccess } = useSWR(
    user ? "/api/user/insights-access" : null,
    insightsAccessFetcher,
  );

  const showProductLinks = Boolean(user) || (loading && initialHasSession);
  const productItems = personalProductNavItems();

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [pathname, tab]);

  useEffect(() => {
    if (!mobileOpen && !userMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
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

  if (pathname.startsWith("/insights")) return null;

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

  const marketingLinks = (
    <>
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
    </>
  );

  return (
    <>
      <nav
        data-navbar-root="true"
        className="relative z-[99999] border-b border-border-hard bg-surface py-3 text-on-surface md:py-4"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className={cn(PAGE_COLUMN_CLASS, "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[1fr_auto_1fr]")}>
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

          <div className="order-2 hidden min-w-0 max-w-full items-center justify-self-center overflow-x-auto md:flex">
            {showProductLinks
              ? productItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    data-testid={`dashboard-tab-${item.id}`}
                    aria-current={productNavItemIsActive(item, pathname, tab) ? "page" : undefined}
                    className={navLinkClass(productNavItemIsActive(item, pathname, tab))}
                  >
                    {item.label}
                  </Link>
                ))
              : marketingLinks}
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

            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-border-hard text-on-surface hover:bg-surface-container-low md:hidden"
              data-testid="nav-menu-toggle"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </nav>
      <MobileNavDrawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
        <div className="flex h-full min-h-0 flex-col p-3" id="mobile-nav-drawer">
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Primary">
            {showProductLinks
              ? productItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    data-testid={`dashboard-tab-${item.id}-mobile`}
                    aria-current={productNavItemIsActive(item, pathname, tab) ? "page" : undefined}
                    className={drawerLinkClass}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                ))
              : (
                <>
                  <Link href="/events" onClick={() => setMobileOpen(false)} className={drawerLinkClass}>
                    Events
                  </Link>
                  <button type="button" onClick={scrollToHowItWorks} className={cn(drawerLinkClass, "w-full text-left")}>
                    How it works
                  </button>
                  <Link href="/enterprise" onClick={() => setMobileOpen(false)} className={drawerLinkClass}>
                    Enterprise
                  </Link>
                  <Link href="/about" onClick={() => setMobileOpen(false)} className={drawerLinkClass}>
                    About
                  </Link>
                </>
              )}
            {user ? (
              <Link href="/events/new" onClick={() => setMobileOpen(false)} className={drawerLinkClass}>
                Create event
              </Link>
            ) : null}
          </nav>
        </div>
      </MobileNavDrawer>
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </>
  );
}
