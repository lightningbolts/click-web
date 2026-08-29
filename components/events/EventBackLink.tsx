"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/cn";

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
  if (args.signedIn) return "/events";
  return "/events";
}

export default function EventBackLink({
  href,
  className,
}: {
  href?: string;
  className?: string;
}) {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <button
      type="button"
      data-testid="event-back-link"
      onClick={() => {
        if (href) {
          router.push(href);
          return;
        }
        router.push(
          eventBackHref({
            referrer: typeof document !== "undefined" ? document.referrer : "",
            origin: typeof window !== "undefined" ? window.location.origin : "",
            signedIn: Boolean(user),
          }),
        );
      }}
      className={cn(
        "mb-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline",
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  );
}
