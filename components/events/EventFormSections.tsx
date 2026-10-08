"use client";

import { CircleAlert, ImagePlus, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ds/Button";
import { CardVisual } from "@/components/ds/CardVisual";
import { Chip } from "@/components/ds/Chip";
import { ListGroup } from "@/components/ds/ListGroup";
import { Select, TextField, fieldClassName } from "@/components/ds/TextField";
import { Toggle } from "@/components/ds/Toggle";
import {
  EVENT_CATEGORY_OPTIONS,
  EVENT_COVER_THEME_IDS,
  MAX_EVENT_CATEGORIES,
  type EventVisibility,
  type GuestListVisibility,
} from "@/lib/events/eventOptions";
import {
  EVENT_RECURRENCE_FREQUENCIES,
  EVENT_RECURRENCE_LABELS,
  MAX_EVENT_OCCURRENCES,
  MIN_EVENT_OCCURRENCES,
  type EventRecurrenceFrequency,
} from "@/lib/events/eventRecurrence";
import type { EventFormErrors, EventFormField } from "@/lib/events/eventFormValidation";
import { timeZoneOptions, type WallClock } from "@/lib/events/zonedTime";
import type { ManagerPlace } from "@/lib/places/managerClient";
import { COVER_IMAGE_ACCEPT } from "@/lib/uploads/constants";
import { cn } from "@/lib/cn";

export type VenueScale = "intimate" | "neighborhood" | "venue" | "campus";

/** Small inline field for list rows (date, time, select). */
export const compactField = cn(fieldClassName, "h-9 w-auto px-2.5 tabular");

export const errorId = (field: EventFormField) => `${field}-error`;

/** aria props for an input whose error renders under its row. */
export function invalidProps(field: EventFormField, errors: EventFormErrors) {
  return errors[field]
    ? { "aria-invalid": true as const, "aria-describedby": errorId(field) }
    : {};
}

export function FieldError({ field, errors, className }: { field: EventFormField; errors: EventFormErrors; className?: string }) {
  const message = errors[field];
  if (!message) return null;
  return (
    <p id={errorId(field)} className={cn("type-meta flex items-center gap-1 text-destructive", className)}>
      <CircleAlert size={14} strokeWidth={2} aria-hidden className="shrink-0" />
      {message}
    </p>
  );
}

/** A ListGroup row holding a label and its controls; the error sits under the row. */
function FormRow({
  label,
  htmlFor,
  children,
  below,
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  below?: ReactNode;
}) {
  return (
    <li className="group/row px-4">
      <div className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2 py-2 shadow-[inset_0_1px_0_var(--hairline)] group-first/row:shadow-none">
        <label htmlFor={htmlFor} className="type-body min-w-20 flex-1 text-fg">
          {label}
        </label>
        <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
      </div>
      {below ? <div className="pb-3">{below}</div> : null}
    </li>
  );
}

const THEME_LABEL = (id: string) => id.replace("theme:", "").replace(/^./, (c) => c.toUpperCase());

/** Left column (spec §7.6.3): 1:1 preview, "Upload photo" and the theme chips. */
export function CoverColumn({
  seed,
  imageUrl,
  uploading,
  uploadError,
  onUpload,
  onRemovePhoto,
  themeId,
  onTheme,
}: {
  seed: string;
  imageUrl: string | null;
  uploading: boolean;
  uploadError: string | null;
  onUpload: (file: File) => void;
  onRemovePhoto: () => void;
  themeId: string;
  onTheme: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div className="space-y-4" data-testid="event-cover">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onUpload(file);
        }}
        className={cn("rounded-xl transition-shadow", dragOver && "shadow-[0_0_0_3px_var(--accent)]")}
      >
        <CardVisual seed={seed} ratio="1:1" radius="xl" photoUrl={imageUrl} sizes="340px" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={cn(
            "press inline-flex h-9 cursor-pointer items-center gap-2 rounded-pill bg-fill-subtle px-4 font-semibold text-fg hover:bg-fill-strong",
            "type-meta focus-within:shadow-[0_0_0_2px_var(--accent)]",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          <ImagePlus size={16} strokeWidth={2} aria-hidden />
          {uploading ? "Uploading…" : imageUrl ? "Replace photo" : "Upload photo"}
          <input
            type="file"
            accept={COVER_IMAGE_ACCEPT}
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
        </label>
        {imageUrl ? (
          <Button variant="plain" size="sm" icon={Trash2} onClick={onRemovePhoto}>
            Remove
          </Button>
        ) : null}
      </div>
      {uploadError ? (
        <p className="type-meta flex items-center gap-1 text-destructive" role="alert">
          <CircleAlert size={14} strokeWidth={2} aria-hidden className="shrink-0" />
          {uploadError}
        </p>
      ) : (
        <p className="type-meta text-fg-tertiary">Square photos look best. Large photos are compressed for you.</p>
      )}
      <div role="group" aria-label="Theme" data-testid="event-theme-picker">
        <p className="type-meta mb-2 font-semibold text-fg-secondary">Theme</p>
        <div className="flex flex-wrap gap-2">
          {EVENT_COVER_THEME_IDS.map((id) => (
            <Chip key={id} size="sm" selected={themeId === id} onClick={() => onTheme(id)}>
              <CardVisual seed={id} radius={0} className="size-3.5 rounded-full" />
              {THEME_LABEL(id)}
            </Chip>
          ))}
        </div>
        {imageUrl ? <p className="type-meta mt-2 text-fg-tertiary">The theme tints the page around your photo.</p> : null}
      </div>
    </div>
  );
}

/** "Host as" (spec §7.6.3): only Places the viewer can write to. Create-only. */
export function HostAsField({
  places,
  value,
  onChange,
}: {
  places: ManagerPlace[];
  value: string | null;
  onChange: (placeId: string | null) => void;
}) {
  const selected = places.find((p) => p.id === value) ?? null;
  return (
    <div className="flex items-end gap-3" data-testid="event-host-as">
      <CardVisual
        seed={selected?.id ?? "me"}
        photoUrl={selected?.photo_url}
        radius="sm"
        sizes="20px"
        className={cn("mb-3 size-5 shrink-0", !selected && "hidden")}
      />
      <Select
        id="event-host"
        label="Host as"
        className="flex-1"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        help={selected ? "The event appears on this Place’s page. Its managers can edit it." : undefined}
      >
        <option value="">Me</option>
        {places.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** When (spec §7.6.3): wall-clock dates and times in an explicit zone, plus Repeats. */
export function WhenGroup({
  start,
  end,
  timeZone,
  repeat,
  repeatCount,
  showRepeat,
  errors,
  onStart,
  onEnd,
  onTimeZone,
  onRepeat,
  onRepeatCount,
  onBlurField,
}: {
  start: WallClock;
  end: WallClock;
  timeZone: string;
  repeat: EventRecurrenceFrequency | null;
  repeatCount: string;
  showRepeat: boolean;
  errors: EventFormErrors;
  onStart: (wc: WallClock) => void;
  onEnd: (wc: WallClock) => void;
  onTimeZone: (tz: string) => void;
  onRepeat: (f: EventRecurrenceFrequency | null) => void;
  onRepeatCount: (v: string) => void;
  onBlurField: (field: EventFormField) => void;
}) {
  const zones = timeZoneOptions(timeZone);
  const dateTime = (field: "event-start" | "event-end", value: WallClock, set: (wc: WallClock) => void, noun: string) => (
    <>
      <input
        id={field}
        type="date"
        required
        aria-label={`${noun} date`}
        className={compactField}
        value={value.date}
        onChange={(e) => set({ ...value, date: e.target.value })}
        onBlur={() => onBlurField(field)}
        {...invalidProps(field, errors)}
      />
      <input
        type="time"
        required
        step={300}
        aria-label={`${noun} time`}
        className={compactField}
        value={value.time}
        onChange={(e) => set({ ...value, time: e.target.value })}
        onBlur={() => onBlurField(field)}
        {...invalidProps(field, errors)}
      />
    </>
  );
  return (
    <ListGroup header="When" aria-label="When">
      <FormRow label="Starts" htmlFor="event-start" below={<FieldError field="event-start" errors={errors} />}>
        {dateTime("event-start", start, onStart, "Start")}
      </FormRow>
      <FormRow label="Ends" htmlFor="event-end" below={<FieldError field="event-end" errors={errors} />}>
        {dateTime("event-end", end, onEnd, "End")}
      </FormRow>
      <FormRow label="Time zone" htmlFor="event-timezone">
        <select
          id="event-timezone"
          className={cn(compactField, "max-w-52 truncate")}
          value={timeZone}
          onChange={(e) => onTimeZone(e.target.value)}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </FormRow>
      {showRepeat ? (
        <FormRow
          label="Repeats"
          htmlFor="event-repeat"
          below={
            repeat ? (
              <>
                <FieldError field="event-repeat-count" errors={errors} className="mb-1" />
                <p className="type-meta text-fg-tertiary">
                  Each date gets its own event page, RSVPs and chat.
                </p>
              </>
            ) : undefined
          }
        >
          <select
            id="event-repeat"
            className={compactField}
            value={repeat ?? ""}
            onChange={(e) => onRepeat((e.target.value || null) as EventRecurrenceFrequency | null)}
          >
            <option value="">Never</option>
            {EVENT_RECURRENCE_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {EVENT_RECURRENCE_LABELS[f]}
              </option>
            ))}
          </select>
          {repeat ? (
            <span className="type-meta flex items-center gap-2 text-fg-secondary">
              <input
                id="event-repeat-count"
                type="number"
                inputMode="numeric"
                min={MIN_EVENT_OCCURRENCES}
                max={MAX_EVENT_OCCURRENCES}
                aria-label="Number of events"
                className={cn(compactField, "w-16")}
                value={repeatCount}
                onChange={(e) => onRepeatCount(e.target.value)}
                onBlur={() => onBlurField("event-repeat-count")}
                {...invalidProps("event-repeat-count", errors)}
              />
              events
            </span>
          ) : null}
        </FormRow>
      ) : null}
    </ListGroup>
  );
}

const VISIBILITY_HELP: Record<EventVisibility, string> = {
  public: "Anyone can find it in Events and on the map.",
  unlisted: "Only people with the link can see it.",
  invite_only: "Only people on your guest list can RSVP.",
};

const SCALES: { value: VenueScale; label: string }[] = [
  { value: "intimate", label: "Intimate · 75 m" },
  { value: "neighborhood", label: "Neighborhood · 250 m" },
  { value: "venue", label: "Venue · 750 m" },
  { value: "campus", label: "Campus · 2.5 km" },
];

export type EventOptionsValue = {
  visibility: EventVisibility;
  approvalRequired: boolean;
  capacityText: string;
  guestListVisibility: GuestListVisibility;
  showCreatorName: boolean;
  venueScale: VenueScale;
  categories: string[];
};

/** Options (spec §7.6.3): visibility, approval, capacity, guest list, check-in area, categories. */
export function OptionsGroup({
  value,
  onChange,
  errors,
  onBlurField,
  hostedByPlace,
}: {
  value: EventOptionsValue;
  onChange: (patch: Partial<EventOptionsValue>) => void;
  errors: EventFormErrors;
  onBlurField: (field: EventFormField) => void;
  hostedByPlace: boolean;
}) {
  return (
    <div className="space-y-6" data-testid="event-options">
      <ListGroup header="Options" aria-label="Options" footer={VISIBILITY_HELP[value.visibility]}>
        <FormRow label="Visibility" htmlFor="event-visibility">
          <select
            id="event-visibility"
            className={compactField}
            value={value.visibility}
            onChange={(e) => onChange({ visibility: e.target.value as EventVisibility })}
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="invite_only">Invite only</option>
          </select>
        </FormRow>
        <FormRow label="Require approval" htmlFor="event-approval">
          <Toggle
            id="event-approval"
            checked={value.approvalRequired}
            onCheckedChange={(approvalRequired) => onChange({ approvalRequired })}
          />
        </FormRow>
        <FormRow label="Capacity" htmlFor="event-capacity" below={<FieldError field="event-capacity" errors={errors} />}>
          <input
            id="event-capacity"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="Unlimited"
            className={cn(compactField, "w-28 text-right")}
            value={value.capacityText}
            onChange={(e) => onChange({ capacityText: e.target.value })}
            onBlur={() => onBlurField("event-capacity")}
            {...invalidProps("event-capacity", errors)}
          />
        </FormRow>
        <FormRow label="Guest list" htmlFor="event-guest-list">
          <select
            id="event-guest-list"
            className={compactField}
            value={value.guestListVisibility}
            onChange={(e) => onChange({ guestListVisibility: e.target.value as GuestListVisibility })}
          >
            <option value="public">Visible to guests</option>
            <option value="hosts_only">Hosts only</option>
          </select>
        </FormRow>
        {hostedByPlace ? null : (
          <FormRow label="Show my name as host" htmlFor="event-show-name">
            <Toggle
              id="event-show-name"
              checked={value.showCreatorName}
              onCheckedChange={(showCreatorName) => onChange({ showCreatorName })}
            />
          </FormRow>
        )}
        <FormRow label="Check-in area" htmlFor="event-scale">
          <select
            id="event-scale"
            className={compactField}
            value={value.venueScale}
            onChange={(e) => onChange({ venueScale: e.target.value as VenueScale })}
          >
            {SCALES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </FormRow>
      </ListGroup>
      <CategoriesField value={value.categories} onChange={(categories) => onChange({ categories })} />
    </div>
  );
}

function CategoriesField({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [custom, setCustom] = useState("");
  const full = value.length >= MAX_EVENT_CATEGORIES;
  const has = (c: string) => value.some((v) => v.toLowerCase() === c.toLowerCase());
  const options = [...EVENT_CATEGORY_OPTIONS, ...value.filter((v) => !(EVENT_CATEGORY_OPTIONS as readonly string[]).some((o) => o.toLowerCase() === v.toLowerCase()))];
  const add = () => {
    const next = custom.trim();
    if (!next || full) return;
    if (!has(next)) onChange([...value, next]);
    setCustom("");
  };
  return (
    <section aria-labelledby="event-categories-heading">
      <h3 id="event-categories-heading" className="type-meta mb-2 px-4 font-semibold text-fg-secondary">
        Categories
      </h3>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Categories">
        {options.map((c) => {
          const on = has(c);
          return (
            <Chip
              key={c}
              size="sm"
              showCheck
              selected={on}
              disabled={!on && full}
              onClick={() => onChange(on ? value.filter((v) => v.toLowerCase() !== c.toLowerCase()) : [...value, c])}
            >
              {c}
            </Chip>
          );
        })}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <TextField
          label="Custom category"
          hideLabel
          className="flex-1"
          value={custom}
          maxLength={40}
          placeholder="Add your own"
          disabled={full}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" icon={Plus} onClick={add} disabled={!custom.trim() || full}>
          Add
        </Button>
      </div>
      <p className="type-meta mt-2 px-4 text-fg-tertiary" aria-live="polite">
        {full ? `That’s ${MAX_EVENT_CATEGORIES}, the most an event can have.` : `Pick up to ${MAX_EVENT_CATEGORIES}.`}
      </p>
    </section>
  );
}
