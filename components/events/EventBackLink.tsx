"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

export function eventBackHref(args: {
  referrer: string;
  origin: string;
  signedIn: boolean;
}): string {
  let pathname = "";
  if (args.referrer) {
    try {
      const url = new URL(args.referrer);
      if (url.origin === args.origin) pathname = url.pathname;
    } catch {
      pathname = "";
    }
  }
  if (pathname === "/events" || pathname.startsWith("/events/")) {
    return "/events";
  }
  if (args.signedIn) return "/?tab=events";
  return "/events";
}

export default function EventBackLink() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <button
      type="button"
      data-testid="event-back-link"
      onClick={() => {
        const href = eventBackHref({
          referrer: typeof document !== "undefined" ? document.referrer : "",
          origin: typeof window !== "undefined" ? window.location.origin : "",
          signedIn: Boolean(user),
        });
        router.push(href);
      }}
      className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  );
}
