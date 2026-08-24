"use client";

import { useState } from "react";
import { FcButton } from "@/components/fc";

export default function EventCopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
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
