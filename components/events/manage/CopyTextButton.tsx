"use client";

import { Copy } from "lucide-react";
import { IconButton } from "@/components/ds/IconButton";
import { toast } from "@/components/ds/Toast";

export function CopyTextButton({ text, label, toastText = "Copied" }: { text: string; label: string; toastText?: string }) {
  return (
    <IconButton
      icon={Copy}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success(toastText);
        } catch {
          toast.error("Couldn’t copy.");
        }
      }}
    />
  );
}
