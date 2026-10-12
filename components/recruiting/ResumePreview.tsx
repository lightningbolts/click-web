"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ds";

/** Inline PDF preview, loaded only when asked for: each load mints a fresh one-minute signed URL. */
export function ResumePreview({ src, fileName }: { src: string; fileName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" icon={open ? EyeOff : Eye} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Hide preview" : "Preview"}
      </Button>
      {open ? (
        <iframe
          src={src}
          title={`Resume preview: ${fileName}`}
          className="order-last mt-3 h-[70vh] min-h-96 w-full basis-full rounded-md bg-surface-raised"
        />
      ) : null}
    </>
  );
}
