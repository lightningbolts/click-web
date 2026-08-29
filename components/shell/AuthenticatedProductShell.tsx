"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart2 } from "lucide-react";
import useSWR from "swr";
import { useAuth } from "@/lib/AuthContext";
import ProductAppShell from "@/components/shell/ProductAppShell";
import { displayNameFromUserMetadata } from "@/lib/userDisplayName";
import { personalProductNavItems } from "@/lib/shell/personalProductNav";
import { fetchInsightsApiJson } from "@/lib/insights/fetchInsightsApi";

type InsightsAccessPayload = { insightsAllowed: boolean };

const insightsAccessFetcher = (url: string) =>
  fetchInsightsApiJson<InsightsAccessPayload>(url);

/**
 * Wraps public event routes in ProductAppShell when the visitor is signed in,
 * so they keep the same chrome as the dashboard instead of marketing Navbar.
 * Anonymous visitors render children only (SEO / share links).
 */
export default function AuthenticatedProductShell({ children }: { children: ReactNode }) {
  const { user, signOut, profileImageUrl } = useAuth();
  const router = useRouter();
  const { data: insightsAccess } = useSWR(
    user ? "/api/user/insights-access" : null,
    insightsAccessFetcher,
  );

  if (!user) {
    return <>{children}</>;
  }

  const userLabel =
    displayNameFromUserMetadata(user.user_metadata) || user.email?.split("@")[0] || null;

  return (
    <ProductAppShell
      productLabel="Click"
      productHref="/"
      items={personalProductNavItems()}
      activeId="events"
      hideHeader
      title="Events"
      extraNav={
        insightsAccess?.insightsAllowed
          ? [{ href: "/insights", label: "Insights", icon: BarChart2 }]
          : []
      }
      userLabel={userLabel}
      userAvatarUrl={profileImageUrl}
      onSignOut={async () => {
        await signOut();
        router.push("/");
      }}
      actions={
        <Link href="/events/new" className="fc-btn-primary inline-flex h-11 items-center px-4">
          Create event
        </Link>
      }
      rootTestId="event-product-shell"
      itemTestIdPrefix="dashboard-tab"
    >
      {children}
    </ProductAppShell>
  );
}
