"use client";

import { Copy, Download, ImagePlus } from "lucide-react";
import dynamic from "next/dynamic";
import { QRCodeSVG } from "qrcode.react";
import { useRef, useState } from "react";
import { Button } from "@/components/ds/Button";
import { cardClassName } from "@/components/ds/Card";
import { toast } from "@/components/ds/Toast";
import type { FlyerEvent } from "@/lib/events/flyerEvent";

const ClickFlyerSheet = dynamic(() => import("@/components/events/ClickFlyerSheet").then((m) => m.ClickFlyerSheet), { ssr: false });

/**
 * Share link, event QR and Click Flyer (spec §7.6.4 Overview, 06 §8). The QR stays dark on white
 * so it scans in dark mode.
 */
export function ManageShareCard({ url, fileName, flyer }: { url: string; fileName: string; flyer?: FlyerEvent | null }) {
  const qrRef = useRef<SVGSVGElement>(null);
  const [flyerOpen, setFlyerOpen] = useState(false);
  const [flyerUsed, setFlyerUsed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn’t copy the link.");
    }
  };

  const download = () => {
    const svg = qrRef.current;
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${fileName}-qr.svg`;
    a.click();
    URL.revokeObjectURL(href);
  };

  return (
    <section aria-labelledby="manage-share-heading" className={cardClassName({ className: "flex flex-col gap-5 sm:flex-row sm:items-center" })}>
      <div className="w-fit shrink-0 rounded-md bg-white p-3">
        <QRCodeSVG ref={qrRef} value={url} size={128} marginSize={0} title="Event QR code" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 id="manage-share-heading" className="type-headline text-fg">
          Share your event
        </h2>
        <p className="type-meta mt-0.5 text-fg-secondary">Anyone with the link can see the event and RSVP.</p>
        <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md bg-fill-subtle py-1 pl-3 pr-1">
          <span className="type-meta min-w-0 flex-1 truncate text-fg" data-testid="manage-share-url">
            {url}
          </span>
          <Button size="sm" variant="plain" icon={Copy} onClick={() => void copy()}>
            Copy
          </Button>
        </div>
        <div className="-ml-3 mt-2 flex flex-wrap">
          <Button size="sm" variant="plain" icon={Download} onClick={download}>
            Download QR
          </Button>
          {flyer ? (
            <Button
              size="sm"
              variant="plain"
              icon={ImagePlus}
              onClick={() => {
                setFlyerUsed(true);
                setFlyerOpen(true);
              }}
            >
              Create Click Flyer
            </Button>
          ) : null}
        </div>
      </div>
      {flyer && flyerUsed ? <ClickFlyerSheet open={flyerOpen} onOpenChange={setFlyerOpen} event={flyer} /> : null}
    </section>
  );
}
