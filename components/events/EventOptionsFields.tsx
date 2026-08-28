"use client";

import { FcInput } from "@/components/fc";
import { cn } from "@/lib/cn";
import type {
  EventVisibility,
  GuestListVisibility,
} from "@/lib/events/eventOptions";

function Chip({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-semibold",
        selected
          ? "border-primary bg-primary text-on-primary"
          : "border-border-hard bg-surface text-on-surface hover:bg-surface-container-low",
      )}
    >
      {children}
    </button>
  );
}

export default function EventOptionsFields({
  visibility,
  capacity,
  approvalRequired,
  guestListVisibility,
  showCreatorName,
  venueScale,
  categories,
  onVisibility,
  onCapacity,
  onApproval,
  onGuestListVisibility,
  onShowCreatorName,
  onVenueScale,
  onCategories,
}: {
  visibility: EventVisibility;
  capacity: number | null;
  approvalRequired: boolean;
  guestListVisibility: GuestListVisibility;
  showCreatorName: boolean;
  venueScale: "intimate" | "neighborhood" | "venue" | "campus";
  categories: string[];
  onVisibility: (value: EventVisibility) => void;
  onCapacity: (value: number | null) => void;
  onApproval: (value: boolean) => void;
  onGuestListVisibility: (value: GuestListVisibility) => void;
  onShowCreatorName: (value: boolean) => void;
  onVenueScale: (value: "intimate" | "neighborhood" | "venue" | "campus") => void;
  onCategories: (value: string[]) => void;
}) {
  return (
    <details className="rounded-[16px] border border-border-hard bg-surface-container-low p-4" data-testid="event-options">
      <summary className="cursor-pointer text-sm font-bold text-on-surface">Event options</summary>
      <div className="mt-4 space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold text-on-surface">Visibility</p>
          <div className="flex flex-wrap gap-2">
            <Chip selected={visibility === "public"} onClick={() => onVisibility("public")}>
              Public
            </Chip>
            <Chip selected={visibility === "unlisted"} onClick={() => onVisibility("unlisted")}>
              Unlisted
            </Chip>
            <Chip selected={visibility === "invite_only"} onClick={() => onVisibility("invite_only")}>
              Invite-only
            </Chip>
          </div>
          <p className="mt-1.5 text-xs text-on-surface-variant">
            Public appears on /events. Unlisted is link-only. Invite-only requires a guest list match.
          </p>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-on-surface">Capacity</p>
          <div className="flex flex-wrap items-center gap-2">
            <Chip selected={capacity == null} onClick={() => onCapacity(null)}>
              Unlimited
            </Chip>
            <FcInput
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="Cap"
              className="w-28"
              value={capacity ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                onCapacity(Number.isFinite(n) && n > 0 ? Math.floor(n) : null);
              }}
            />
          </div>
        </div>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-semibold text-on-surface">Approval required</span>
            <span className="text-xs text-on-surface-variant">Hosts vet Click RSVPs before they are confirmed.</span>
          </span>
          <input
            type="checkbox"
            checked={approvalRequired}
            onChange={(e) => onApproval(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
        </label>
        <div>
          <p className="mb-2 text-sm font-semibold text-on-surface">Guest list visibility</p>
          <div className="flex flex-wrap gap-2">
            <Chip selected={guestListVisibility === "public"} onClick={() => onGuestListVisibility("public")}>
              Public
            </Chip>
            <Chip selected={guestListVisibility === "hosts_only"} onClick={() => onGuestListVisibility("hosts_only")}>
              Hosts only
            </Chip>
          </div>
        </div>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-semibold text-on-surface">Display my name</span>
            <span className="text-xs text-on-surface-variant">Show your name as host on the event page.</span>
          </span>
          <input
            type="checkbox"
            checked={showCreatorName}
            onChange={(e) => onShowCreatorName(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
        </label>
        <div>
          <p className="mb-2 text-sm font-semibold text-on-surface">Check-in area</p>
          <div className="flex flex-wrap gap-2">
            {(["intimate", "neighborhood", "venue", "campus"] as const).map((scale) => (
              <Chip key={scale} selected={venueScale === scale} onClick={() => onVenueScale(scale)}>
                {scale === "intimate"
                  ? "Intimate"
                  : scale === "neighborhood"
                    ? "Neighborhood"
                    : scale === "venue"
                      ? "Venue"
                      : "Campus"}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-on-surface">Categories</p>
          <div className="flex flex-wrap gap-2">
            {["Promotional", "Social", "School Event"].map((cat) => {
              const on = categories.includes(cat);
              return (
                <Chip
                  key={cat}
                  selected={on}
                  onClick={() =>
                    onCategories(on ? categories.filter((c) => c !== cat) : [...categories, cat])
                  }
                >
                  {cat}
                </Chip>
              );
            })}
          </div>
        </div>
      </div>
    </details>
  );
}
