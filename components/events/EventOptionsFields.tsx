"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { FcInput } from "@/components/fc";
import { Pill } from "@/components/ui/Pill";
import { Toggle } from "@/components/ui/Toggle";
import { InfoRow } from "@/components/ui/InfoRow";
import type {
  EventVisibility,
  GuestListVisibility,
} from "@/lib/events/eventOptions";
import { EVENT_CATEGORY_OPTIONS } from "@/lib/events/eventOptions";

const CHECK_IN_TOOLTIP =
  "Choose how close guests must be to the event pin to check in: Intimate 75 m, Neighborhood 250 m, Venue 750 m, or Campus 2.5 km.";

function OptionGroup({
  title,
  tooltip,
  children,
}: {
  title: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-border-hard pt-5 first:border-t-0 first:pt-0">
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
  const [customCategory, setCustomCategory] = useState("");

  const addCustomCategory = () => {
    const next = customCategory.trim();
    if (!next || categories.length >= 8) return;
    if (!categories.some((category) => category.toLowerCase() === next.toLowerCase())) {
      onCategories([...categories, next]);
    }
    setCustomCategory("");
  };
  const categoryOptions = [
    ...EVENT_CATEGORY_OPTIONS,
    ...categories.filter(
      (category) =>
        !EVENT_CATEGORY_OPTIONS.some(
          (preset) => preset.toLowerCase() === category.toLowerCase(),
        ),
    ),
  ];

  return (
    <section className="space-y-5 border-t border-border-hard pt-6" data-testid="event-options">
      <div>
        <h2 className="text-lg font-bold text-on-surface">Event options</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Control who can find the event, who can attend, and how check-in works.
        </p>
      </div>
      <div className="space-y-5">
        <OptionGroup title="Visibility & access">
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
              Public events appear in Explore. Unlisted events are available only by link.
              Invite-only events require the guest to be on your list.
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
        </OptionGroup>

        <OptionGroup title="Capacity">
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
        </OptionGroup>

        <OptionGroup title="Check-in area" tooltip={CHECK_IN_TOOLTIP}>
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
        </OptionGroup>

        <OptionGroup title="Categories">
          <p className="text-xs text-on-surface-variant">Choose up to 8 categories.</p>
          <div className="flex flex-wrap gap-2">
            {categoryOptions.map((cat) => {
              const on = categories.includes(cat);
              return (
                <Pill
                  key={cat}
                  selected={on}
                  disabled={!on && categories.length >= 8}
                  onClick={() =>
                    onCategories(on ? categories.filter((c) => c !== cat) : [...categories, cat])
                  }
                >
                  {cat}
                </Pill>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <FcInput
              value={customCategory}
              onChange={(event) => setCustomCategory(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustomCategory();
                }
              }}
              maxLength={40}
              placeholder="Add a custom category"
              aria-label="Custom event category"
              className="flex-1"
            />
            <button
              type="button"
              onClick={addCustomCategory}
              disabled={!customCategory.trim() || categories.length >= 8}
              className="fc-btn-secondary inline-flex items-center justify-center gap-2 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </button>
          </div>
        </OptionGroup>
      </div>
    </section>
  );
}
