"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { setApplicationStatusAction } from "@/app/(admin)/admin/recruiting/actions";
import { Spinner } from "@/components/ds/Spinner";
import { STATUS_PILL_VARIANT } from "@/components/ds/StatusPill";
import { toast } from "@/components/ds/Toast";
import { cn } from "@/lib/cn";
import { APPLICATION_STATUSES, statusMeta, type ApplicationStatus } from "@/lib/careers/recruiting";

/**
 * Status as a colored native select: one tap to change, from the table or the detail view.
 * Shows the choice while saving and reverts if the server refuses it.
 */
export function StatusSelect({
  applicationId,
  status,
  applicantName,
  size = "sm",
}: {
  applicationId: string;
  status: ApplicationStatus;
  applicantName: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useState(status);
  const [confirmed, setConfirmed] = useState(status);
  if (status !== confirmed) {
    setConfirmed(status);
    setShown(status);
  }

  const onChange = (next: ApplicationStatus) => {
    setShown(next);
    startTransition(async () => {
      const result = await setApplicationStatusAction(applicationId, status, next).catch(() => ({
        ok: false as const,
        error: "Couldn't reach Click. The status wasn't changed.",
        conflict: false,
      }));
      if (result.ok) {
        toast.success(`${applicantName}: ${statusMeta(next).label}`);
        return;
      }
      setShown(status);
      toast.error(result.error);
      if (result.conflict) router.refresh();
    });
  };

  return (
    <div
      className={cn(
        "relative inline-flex items-center rounded-pill",
        STATUS_PILL_VARIANT[statusMeta(shown).variant],
      )}
    >
      <select
        aria-label={`Status for ${applicantName}`}
        value={shown}
        disabled={pending}
        aria-busy={pending || undefined}
        onChange={(e) => onChange(e.target.value as ApplicationStatus)}
        className={cn(
          "cursor-pointer appearance-none rounded-pill bg-transparent font-semibold text-inherit outline-none transition-opacity",
          "focus-visible:shadow-[0_0_0_2px_var(--accent)] disabled:cursor-progress disabled:opacity-70",
          size === "sm" ? "type-badge h-7 pl-2.5 pr-7" : "type-meta h-9 pl-3.5 pr-9",
        )}
      >
        {APPLICATION_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className={cn("pointer-events-none absolute flex items-center", size === "sm" ? "right-2" : "right-3")}
      >
        {pending ? <Spinner size={12} /> : <ChevronDown size={size === "sm" ? 14 : 16} strokeWidth={2.25} />}
      </span>
    </div>
  );
}
