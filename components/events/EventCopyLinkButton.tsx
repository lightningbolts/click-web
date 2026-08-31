"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { FcButton } from "@/components/fc";
import { cn } from "@/lib/cn";

export default function EventCopyLinkButton({
  url,
  icon = false,
}: {
  url: string;
  icon?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (icon) {
    return (
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy link"}
        title={copied ? "Copied" : "Copy link"}
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        }}
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-border-hard bg-surface text-on-surface hover:bg-surface-container-low",
        )}
      >
        <Link2 className="h-4 w-4" />
      </button>
    );
  }
  return (
    <FcButton
      type="button"
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }}
    >
      {copied ? "Copied" : "Copy link"}
    </FcButton>
  );
}
