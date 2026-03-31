"use client";

import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import UserProfile from "@/components/UserProfile";
import { useState } from "react";
import LoginModal from "@/components/LoginModal";
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

  // Hide on /insights — BusinessInsightsShell has its own sticky nav there
  if (pathname.startsWith("/insights")) return null;

  // User is viewing their dashboard when logged in at root or /dashboard
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
        className={`relative z-[99999] flex items-center justify-between px-4 md:px-12 py-6 gap-2 ${isLoggedInView ? "border-b border-zinc-800" : ""}`}
      >
        <Link href="/" className="text-xl md:text-2xl font-bold flex-shrink-0">
          <span className="text-[#8338EC]">C</span>
          <span className="text-white">lick</span>
        </Link>
        <div className="flex items-center gap-2 md:gap-6">
          {isLoggedInView ? (
            <>
              {insightsAccess?.insightsAllowed ? (
                <Link
                  href="/insights"
                  className="flex items-center gap-1 md:gap-2 text-xs md:text-sm px-2 md:px-4 py-2 rounded-full border border-zinc-700 hover:border-[#8338EC] hover:text-[#8338EC] transition-colors whitespace-nowrap"
                >
                  <BarChart2 className="w-3 h-3 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">Insights</span>
                </Link>
              ) : null}
              <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-zinc-400">
                <User className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                <span className="truncate max-w-[100px] md:max-w-[200px]">
                  {displayNameFromUserMetadata(user?.user_metadata) || user?.email}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1 md:gap-2 text-xs md:text-sm px-2 md:px-4 py-2 rounded-full border border-zinc-700 hover:border-red-500 hover:text-red-500 transition-colors whitespace-nowrap"
              >
                <LogOut className="w-3 h-3 md:w-4 md:h-4" />
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
                className="text-xs md:text-sm hover:text-[#8338EC] transition-colors"
              >
                Mission
              </button>
              <Link
                href="/enterprise"
                className="text-xs md:text-sm hover:text-[#8338EC] transition-colors"
              >
                Enterprise
              </Link>
              <Link
                href="/about"
                className="text-xs md:text-sm hover:text-[#8338EC] transition-colors"
              >
                About
              </Link>
              {user ? (
                <UserProfile />
              ) : (
                <button
                  onClick={() => setIsLoginOpen(true)}
                  className="text-xs md:text-sm px-3 md:px-4 py-2 rounded-full border border-zinc-700 hover:border-[#8338EC] transition-colors"
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
