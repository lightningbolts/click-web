"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ds/Button";
import { toast } from "@/components/ds/Toast";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";

export function PublishSummaryButton({ beaconId }: { beaconId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="primary"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/beacons/${beaconId}/summary/publish`, {
            method: "POST",
            headers: await getFreshAuthHeaders(),
          });
          if (!res.ok) {
            toast.error("Couldn’t publish the summary.");
            return;
          }
          toast.success("Summary published");
          router.refresh();
        } catch {
          toast.error("Couldn’t publish the summary.");
        } finally {
          setBusy(false);
        }
      }}
    >
      Publish summary
    </Button>
  );
}
