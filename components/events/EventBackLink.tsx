"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

function previousPageIsThisOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const referrer = document.referrer;
  if (!referrer) return window.history.length > 1;
  try {
    return new URL(referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

export default function EventBackLink() {
  const router = useRouter();

  return (
    <button
      type="button"
      data-testid="event-back-link"
      onClick={() => {
        if (previousPageIsThisOrigin()) {
          router.back();
          return;
        }
        router.push("/events");
      }}
      className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-secondary hover:underline"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  );
}
