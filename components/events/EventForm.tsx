"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import { Button } from "@/components/ds/Button";
import { Skeleton } from "@/components/ds/Skeleton";
import { TitleInput } from "@/components/ds/TextField";
import { toast } from "@/components/ds/Toast";
import EventLocationPicker from "@/components/events/EventLocationPicker";
import EventMarkdownEditor from "@/components/events/EventMarkdownEditor";
import {
  CoverColumn,
  FieldError,
  HostAsField,
  OptionsGroup,
  WhenGroup,
  errorId,
  invalidProps,
  type EventOptionsValue,
} from "@/components/events/EventFormSections";
import { useAuth } from "@/lib/AuthContext";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import { placeRoleCanWrite } from "@/lib/events/beaconManageAuth";
import type { EventFormDraft } from "@/lib/events/eventFormDraft";
import {
  firstErrorField,
  validateEventForm,
  type EventFormErrors,
  type EventFormField,
} from "@/lib/events/eventFormValidation";
import { resolvedTimeZone } from "@/lib/events/eventScheduleUi";
import { DEFAULT_EVENT_LISTING_OPTIONS, EVENT_COVER_THEME_IDS, coverVisualSeed } from "@/lib/events/eventOptions";
import type { EventRecurrenceFrequency } from "@/lib/events/eventRecurrence";
import { eventSharePath } from "@/lib/events/eventUrls";
import { instantFromWallClock, wallClockInZone, type WallClock } from "@/lib/events/zonedTime";
import { placeApi, type ManagerPlace } from "@/lib/places/managerClient";
import { BEACON_IMAGE_ENDPOINT, COVER_IMAGE_MIME_TYPES } from "@/lib/uploads/constants";
import { useImageUpload } from "@/lib/uploads/useImageUpload";

const HOUR = 3_600_000;

/** Next whole hour in `timeZone`, two hours long. Deterministic from `nowMs`, so SSR matches. */
function defaultWindow(nowMs: number, timeZone: string): { start: WallClock; end: WallClock } {
  const next = wallClockInZone(new Date(nowMs + HOUR), timeZone);
  const start = { date: next.date, time: `${next.time.slice(0, 2)}:00` };
  const startAt = instantFromWallClock(start, timeZone) ?? new Date(nowMs + HOUR);
  return { start, end: wallClockInZone(new Date(startAt.getTime() + 2 * HOUR), timeZone) };
}

const fetchMyPlaces = (url: string) => placeApi<{ places: ManagerPlace[] }>(url);

/**
 * Create / edit an event (spec §7.6.3). Times are wall clocks in an explicit zone, so a host
 * in London can set "7 PM in New York". Errors show per field on blur, and a failed submit
 * scrolls to and focuses the first one.
 */
type EventFormProps = {
  beaconId?: string;
  initial?: EventFormDraft;
  /** The viewer's zone from the time-zone cookie; null before the shell has set it. */
  defaultTimeZone: string | null;
  nowMs: number;
  /** `?host=place:{id}`; honored only when the viewer can write to that Place. */
  initialHostPlaceId?: string | null;
};

const noSubscribe = () => () => {};

export default function EventForm(props: EventFormProps) {
  // Without the cookie, wait for the browser's zone rather than render a UTC form that jumps.
  const browserZone = useSyncExternalStore(noSubscribe, resolvedTimeZone, () => null);
  const zone = props.initial?.timeZone || props.defaultTimeZone || browserZone;
  if (!zone) return <Skeleton rounded="md" className="h-[640px] w-full" />;
  return <EventFormInner {...props} defaultTimeZone={zone} />;
}

function EventFormInner({
  beaconId,
  initial,
  defaultTimeZone,
  nowMs,
  initialHostPlaceId = null,
}: EventFormProps & { defaultTimeZone: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const isEdit = Boolean(beaconId);

  const [timeZone, setTimeZone] = useState(() => initial?.timeZone || defaultTimeZone);
  const [start, setStart] = useState<WallClock>(() =>
    initial?.startIso ? wallClockInZone(initial.startIso, timeZone) : defaultWindow(nowMs, timeZone).start,
  );
  const [end, setEnd] = useState<WallClock>(() =>
    initial?.endIso ? wallClockInZone(initial.endIso, timeZone) : defaultWindow(nowMs, timeZone).end,
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [locationName, setLocationName] = useState(initial?.locationName ?? "");
  const [lat, setLat] = useState(initial?.lat ?? "");
  const [lng, setLng] = useState(initial?.lng ?? "");
  const [themeId, setThemeId] = useState<string>(initial ? initial.coverThemeId : EVENT_COVER_THEME_IDS[0]);
  const [repeat, setRepeat] = useState<EventRecurrenceFrequency | null>(null);
  const [repeatCount, setRepeatCount] = useState("4");
  const [options, setOptions] = useState<EventOptionsValue>(() => ({
    visibility: initial?.visibility ?? DEFAULT_EVENT_LISTING_OPTIONS.event_visibility,
    approvalRequired: initial?.approvalRequired ?? false,
    capacityText: initial?.capacity != null ? String(initial.capacity) : "",
    guestListVisibility: initial?.guestListVisibility ?? "public",
    showCreatorName: initial?.showCreatorName ?? true,
    venueScale: initial?.venueScale ?? "neighborhood",
    categories: initial?.categories ?? [],
  }));
  const [hostPlaceId, setHostPlaceId] = useState<string | null>(initialHostPlaceId);
  const [touched, setTouched] = useState<ReadonlySet<EventFormField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const upload = useImageUpload({
    endpoint: BEACON_IMAGE_ENDPOINT,
    acceptedMimeTypes: COVER_IMAGE_MIME_TYPES,
    compressOversize: true,
  });
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const imageUrl = upload.url ?? (photoRemoved ? null : (initial?.imageUrl ?? null));

  // Places the viewer may host as (owner / manager only; viewers can't create, §9.6).
  const { data: placesData } = useSWR(!isEdit && user ? "/api/places/mine" : null, fetchMyPlaces, {
    revalidateOnFocus: false,
    onSuccess: (data) => {
      const preset = data.places.find((p) => p.id === initialHostPlaceId && placeRoleCanWrite(p.role));
      if (preset && !locationName) prefillFromPlace(preset);
    },
  });
  const writablePlaces = (placesData?.places ?? []).filter((p) => placeRoleCanWrite(p.role));
  const venueId = writablePlaces.some((p) => p.id === hostPlaceId) ? hostPlaceId : null;

  function prefillFromPlace(place: ManagerPlace) {
    if (place.latitude != null && place.longitude != null) {
      setLocationName(place.address_line ? `${place.name}, ${place.address_line}` : place.name);
      setLat(String(place.latitude));
      setLng(String(place.longitude));
    }
    if (place.timezone) setTimeZone(place.timezone);
  }

  const validated = validateEventForm({
    title,
    start,
    end,
    timeZone,
    locationName,
    lat,
    lng,
    capacityText: options.capacityText,
    repeat: !isEdit && repeat ? { frequency: repeat, count: repeatCount } : null,
  });
  const shownErrors: EventFormErrors = submitted
    ? validated.errors
    : Object.fromEntries(Object.entries(validated.errors).filter(([f]) => touched.has(f as EventFormField)));
  const blur = (field: EventFormField) =>
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));

  /** Moving the start keeps the event's length, the way calendars do. */
  const changeStart = (next: WallClock) => {
    const oldStart = instantFromWallClock(start, timeZone);
    const oldEnd = instantFromWallClock(end, timeZone);
    const newStart = instantFromWallClock(next, timeZone);
    setStart(next);
    if (oldStart && oldEnd && newStart && oldEnd > oldStart) {
      setEnd(wallClockInZone(new Date(newStart.getTime() + (oldEnd.getTime() - oldStart.getTime())), timeZone));
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    const first = firstErrorField(validated.errors);
    if (first) {
      const el = document.getElementById(first);
      el?.focus({ preventScroll: true });
      el?.scrollIntoView?.({
        block: "center",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
      return;
    }
    const { startAt, endAt, capacity, recurrence } = validated;
    if (!startAt || !endAt) return;

    const listing = {
      event_visibility: options.visibility,
      event_capacity: capacity,
      approval_required: options.approvalRequired,
      guest_list_visibility: options.guestListVisibility,
      ...(themeId ? { cover_theme_id: themeId } : {}),
    };
    const body = {
      lat: Number(lat),
      lng: Number(lng),
      show_creator_name: options.showCreatorName,
      event_timezone: timeZone,
      ...listing,
      ...(!isEdit && venueId ? { venue_id: venueId } : {}),
      ...(!isEdit && recurrence ? { recurrence } : {}),
      metadata: {
        title: title.trim(),
        description: description.trim(),
        event_start_at: startAt.toISOString(),
        event_end_at: endAt.toISOString(),
        event_timezone: timeZone,
        location_name: locationName.trim(),
        image_url: imageUrl,
        rsvp_enabled: true,
        venue_scale: options.venueScale,
        event_categories: options.categories,
        ...listing,
      },
    };

    setSubmitting(true);
    let navigating = false;
    try {
      const headers = await getFreshAuthHeaders();
      const res = await fetch(isEdit ? `/api/beacons/${beaconId}` : "/api/beacons", {
        method: isEdit ? "PATCH" : "POST",
        headers,
        body: JSON.stringify(isEdit ? body : { kind: "event", ...body }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        beacon?: { id?: string };
        series_count?: number;
        error?: string;
      };
      const id = json.beacon?.id;
      if (!res.ok || !id) {
        setServerError(json.error || (isEdit ? "Couldn’t save your changes. Try again." : "Couldn’t create the event. Try again."));
        return;
      }
      toast.success(
        isEdit ? "Changes saved" : json.series_count && json.series_count > 1 ? `${json.series_count} events created` : "Event created",
      );
      navigating = true;
      router.push(eventSharePath(id));
      if (isEdit) router.refresh();
    } catch {
      setServerError("Check your connection and try again.");
    } finally {
      if (!navigating) setSubmitting(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      data-testid="event-create-form"
      aria-busy={submitting || undefined}
      className="grid items-start gap-8 min-[900px]:grid-cols-[340px_minmax(0,1fr)] min-[900px]:gap-10"
    >
      <div className="min-[900px]:sticky min-[900px]:top-20">
        <CoverColumn
          seed={coverVisualSeed(beaconId ?? "", themeId) || EVENT_COVER_THEME_IDS[0]}
          imageUrl={imageUrl}
          uploading={upload.uploading}
          uploadError={upload.error}
          onUpload={(file) => {
            setPhotoRemoved(false);
            void upload.upload(file);
          }}
          onRemovePhoto={() => {
            upload.setUrl(null);
            setPhotoRemoved(true);
          }}
          themeId={themeId}
          onTheme={setThemeId}
        />
      </div>

      <div className="min-w-0 space-y-8">
        {!isEdit && writablePlaces.length > 0 ? (
          <HostAsField
            places={writablePlaces}
            value={venueId}
            onChange={(id) => {
              setHostPlaceId(id);
              const place = writablePlaces.find((p) => p.id === id);
              if (place && !locationName) prefillFromPlace(place);
            }}
          />
        ) : null}

        <div>
          <label htmlFor="event-title" className="sr-only">
            Event name
          </label>
          <TitleInput
            id="event-title"
            name="title"
            value={title}
            maxLength={80}
            required
            placeholder="Event name"
            autoComplete="off"
            className="aria-[invalid=true]:border-destructive"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => blur("event-title")}
            {...invalidProps("event-title", shownErrors)}
          />
          <FieldError field="event-title" errors={shownErrors} className="mt-1.5" />
        </div>

        <WhenGroup
          start={start}
          end={end}
          timeZone={timeZone}
          repeat={repeat}
          repeatCount={repeatCount}
          showRepeat={!isEdit}
          errors={shownErrors}
          onStart={changeStart}
          onEnd={setEnd}
          onTimeZone={setTimeZone}
          onRepeat={setRepeat}
          onRepeatCount={setRepeatCount}
          onBlurField={blur}
        />

        <section aria-labelledby="event-where-heading">
          <h3 id="event-where-heading" className="type-meta mb-2 px-4 font-semibold text-fg-secondary">
            Where
          </h3>
          <EventLocationPicker
            inputId="event-location"
            locationName={locationName}
            lat={lat}
            lng={lng}
            onLocationNameChange={setLocationName}
            onCoordsChange={(nextLat, nextLng) => {
              setLat(nextLat);
              setLng(nextLng);
            }}
            onBlur={() => blur("event-location")}
            invalid={Boolean(shownErrors["event-location"])}
            describedBy={shownErrors["event-location"] ? errorId("event-location") : undefined}
          />
          <FieldError field="event-location" errors={shownErrors} className="mt-1.5" />
        </section>

        <EventMarkdownEditor value={description} onChange={setDescription} maxLength={10000} />

        <OptionsGroup
          value={options}
          onChange={(patch) => setOptions((prev) => ({ ...prev, ...patch }))}
          errors={shownErrors}
          onBlurField={blur}
          hostedByPlace={Boolean(venueId)}
        />

        <div
          className="material-glass sticky bottom-0 z-10 -mx-[var(--gutter)] px-[var(--gutter)] pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[inset_0_1px_0_var(--hairline)] min-[900px]:static min-[900px]:mx-0 min-[900px]:bg-transparent min-[900px]:p-0 min-[900px]:shadow-none min-[900px]:backdrop-filter-none"
          data-testid="event-form-footer"
        >
          {serverError ? (
            <p role="alert" className="type-meta mb-3 text-destructive">
              {serverError}
            </p>
          ) : submitted && firstErrorField(validated.errors) ? (
            <p role="status" className="type-meta mb-3 text-destructive">
              {Object.keys(validated.errors).length === 1
                ? "Fix the highlighted field to continue."
                : `Fix the ${Object.keys(validated.errors).length} highlighted fields to continue.`}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="flex-1 min-[900px]:flex-none"
              loading={submitting}
              disabled={upload.uploading}
            >
              {isEdit ? "Save changes" : "Create event"}
            </Button>
            <Button variant="plain" size="lg" href={beaconId ? eventSharePath(beaconId) : "/events"}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
