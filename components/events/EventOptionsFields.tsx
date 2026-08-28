"use client";

import { FcInput } from "@/components/fc";
import { Pill } from "@/components/ui/Pill";
import { Toggle } from "@/components/ui/Toggle";
import { InfoRow } from "@/components/ui/InfoRow";
import type {
  EventVisibility,
  GuestListVisibility,
} from "@/lib/events/eventOptions";

const CHECK_IN_TOOLTIP =
  "Check-in area sets the geofencing radius an attendee must be within to check in to the event — Intimate/Neighborhood/Venue/Campus map to increasingly large check-in radii.";

function Subcard({
  title,
  tooltip,
  children,
}: {
  title: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-[16px] border border-border-hard bg-surface-container-low p-4">
      {tooltip ? (
        <InfoRow title={title} tooltip={tooltip} />
      ) : (
        <h3 className="text-sm font-bold text-on-surface">{title}</h3>
      )}
      {children}
    </section>
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
      <div className="mt-4 space-y-4">
        <Subcard title="Visibility & Access">
          <div>
            <p className="mb-2 text-sm font-semibold text-on-surface">Visibility</p>
            <div className="flex flex-wrap gap-2">
              <Pill selected={visibility === "public"} onClick={() => onVisibility("public")}>
                Public
              </Pill>
              <Pill selected={visibility === "unlisted"} onClick={() => onVisibility("unlisted")}>
                Unlisted
              </Pill>
              <Pill selected={visibility === "invite_only"} onClick={() => onVisibility("invite_only")}>
                Invite-only
              </Pill>
            </div>
            <p className="mt-1.5 text-xs text-on-surface-variant">
              Public appears on /events. Unlisted is link-only. Invite-only requires a guest list match.
            </p>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-on-surface">Guest list visibility</p>
            <div className="flex flex-wrap gap-2">
              <Pill
                selected={guestListVisibility === "public"}
                onClick={() => onGuestListVisibility("public")}
              >
                Public
              </Pill>
              <Pill
                selected={guestListVisibility === "hosts_only"}
                onClick={() => onGuestListVisibility("hosts_only")}
              >
                Hosts only
              </Pill>
            </div>
          </div>
          <InfoRow
            title="Approval required"
            description="Hosts vet Click RSVPs before they are confirmed."
          >
            <Toggle
              checked={approvalRequired}
              onCheckedChange={onApproval}
              aria-label="Approval required"
            />
          </InfoRow>
          <InfoRow
            title="Display my name"
            description="Show your name as host on the event page."
          >
            <Toggle
              checked={showCreatorName}
              onCheckedChange={onShowCreatorName}
              aria-label="Display my name"
            />
          </InfoRow>
        </Subcard>

        <Subcard title="Capacity">
          <div className="flex flex-wrap items-center gap-2">
            <Pill selected={capacity == null} onClick={() => onCapacity(null)}>
              Unlimited
            </Pill>
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
        </Subcard>

        <Subcard title="Check-in area" tooltip={CHECK_IN_TOOLTIP}>
          <div className="flex flex-wrap gap-2">
            {(["intimate", "neighborhood", "venue", "campus"] as const).map((scale) => (
              <Pill key={scale} selected={venueScale === scale} onClick={() => onVenueScale(scale)}>
                {scale === "intimate"
                  ? "Intimate"
                  : scale === "neighborhood"
                    ? "Neighborhood"
                    : scale === "venue"
                      ? "Venue"
                      : "Campus"}
              </Pill>
            ))}
          </div>
        </Subcard>

        <section className="space-y-3">
          <h3 className="text-sm font-bold text-on-surface">Categories</h3>
          <div className="flex flex-wrap gap-2">
            {["Promotional", "Social", "School Event"].map((cat) => {
              const on = categories.includes(cat);
              return (
                <Pill
                  key={cat}
                  selected={on}
                  onClick={() =>
                    onCategories(on ? categories.filter((c) => c !== cat) : [...categories, cat])
                  }
                >
                  {cat}
                </Pill>
              );
            })}
          </div>
        </section>
      </div>
    </details>
  );
}
