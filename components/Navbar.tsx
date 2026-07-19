"use client";

import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import UserProfile from "@/components/UserProfile";
import { useState } from "react";
import LoginModal from "@/components/LoginModal";
import ThemeToggle from "@/components/ThemeToggle";
import { usePathname, useRouter } from "next/navigation";
import { User, LogOut, BarChart2 } from "lucide-react";
import { displayNameFromUserMetadata } from "@/lib/userDisplayName";
import useSWR from "swr";
import { fetchInsightsApiJson } from "@/lib/insights/fetchInsightsApi";

type InsightsAccessPayload = { insightsAllowed: boolean };

const insightsAccessFetcher = (url: string) =>
  fetchInsightsApiJson<InsightsAccessPayload>(url);

export default function Navbar() {
  const { user, signOut } = useAuth();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const { data: insightsAccess } = useSWR(
    user ? "/api/user/insights-access" : null,
    insightsAccessFetcher,
  );

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

  return (
    <>
      <nav
        data-navbar-root="true"
        className="relative z-[99999] flex items-center justify-between gap-2 border-b-2 border-border-hard bg-surface px-4 py-4 text-on-surface md:px-12 md:py-5"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
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
              <div className="flex items-center gap-1 text-xs font-medium text-on-surface-variant md:gap-2 md:text-sm">
                <User className="h-3 w-3 shrink-0 md:h-4 md:w-4" />
                <span className="max-w-[100px] truncate md:max-w-[200px]">
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
              <button
                onClick={() => {
                  const missionSection = document.getElementById("mission");
                  if (missionSection) {
                    missionSection.scrollIntoView({ behavior: "smooth" });
                  } else {
                    window.location.href = "/#mission";
                  }
                }}
                className="text-xs font-semibold text-on-surface hover:text-primary md:text-sm"
              >
                Mission
              </button>
              <Link
                href="/enterprise"
                className="text-xs font-semibold text-on-surface hover:text-primary md:text-sm"
              >
                Enterprise
              </Link>
              <Link
                href="/about"
                className="text-xs font-semibold text-on-surface hover:text-primary md:text-sm"
              >
                About
              </Link>
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
            </>
          )}
        </div>
      </nav>
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </>
  );
}
