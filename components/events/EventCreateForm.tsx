"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { FcButton, FcTextarea } from "@/components/fc";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import {
  BEACON_IMAGE_ENDPOINT,
  COVER_IMAGE_ACCEPT,
  COVER_IMAGE_MIME_TYPES,
} from "@/lib/uploads/constants";
import { useImageUpload } from "@/lib/uploads/useImageUpload";
import { eventManagePath, eventSharePath } from "@/lib/events/eventUrls";
import EventLocationPicker from "@/components/events/EventLocationPicker";
import EventDateTimeFields from "@/components/events/EventDateTimeFields";
import EventOptionsFields from "@/components/events/EventOptionsFields";
import EventThemePicker from "@/components/events/EventThemePicker";
import { CardVisualHero } from "@/components/ui/CardVisualSurface";
import {
  DEFAULT_EVENT_LISTING_OPTIONS,
  EVENT_COVER_THEME_IDS,
  type EventVisibility,
  type GuestListVisibility,
} from "@/lib/events/eventOptions";
import { defaultEventWindow, resolvedTimeZone } from "@/lib/events/eventScheduleUi";
import type { EventFormDraft } from "@/lib/events/eventFormDraft";
import { cn } from "@/lib/cn";

type EventCreateFormProps = {
  venueId?: string | null;
  defaultLat?: number | null;
  defaultLng?: number | null;
  defaultLocationName?: string | null;
  beaconId?: string;
  initial?: EventFormDraft;
};

export default function EventCreateForm({
  venueId = null,
  defaultLat = null,
  defaultLng = null,
  defaultLocationName = null,
  beaconId,
  initial,
}: EventCreateFormProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const isEdit = Boolean(beaconId);
  const initialWindow = useMemo(() => defaultEventWindow(), []);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [start, setStart] = useState(() =>
    initial?.startIso ? new Date(initial.startIso) : initialWindow.start,
  );
  const [end, setEnd] = useState(() =>
    initial?.endIso ? new Date(initial.endIso) : initialWindow.end,
  );
  const [timeZone] = useState(() => initial?.timeZone || resolvedTimeZone());
  const [locationName, setLocationName] = useState(initial?.locationName ?? defaultLocationName ?? "");
  const [lat, setLat] = useState(initial?.lat ?? (defaultLat != null ? String(defaultLat) : ""));
  const [lng, setLng] = useState(initial?.lng ?? (defaultLng != null ? String(defaultLng) : ""));
  const [coverThemeId, setCoverThemeId] = useState<string>(
    initial?.coverThemeId ?? EVENT_COVER_THEME_IDS[0],
  );
  const [visibility, setVisibility] = useState<EventVisibility>(
    initial?.visibility ?? DEFAULT_EVENT_LISTING_OPTIONS.event_visibility,
  );
  const [capacity, setCapacity] = useState<number | null>(initial?.capacity ?? null);
  const [approvalRequired, setApprovalRequired] = useState(initial?.approvalRequired ?? false);
  const [guestListVisibility, setGuestListVisibility] = useState<GuestListVisibility>(
    initial?.guestListVisibility ?? "public",
  );
  const [showCreatorName, setShowCreatorName] = useState(initial?.showCreatorName ?? true);
  const [venueScale, setVenueScale] = useState<"intimate" | "neighborhood" | "venue" | "campus">(
    initial?.venueScale ?? "neighborhood",
  );
  const [categories, setCategories] = useState<string[]>(initial?.categories ?? []);
  const {
    uploading,
    error: coverUploadError,
    url: imageUrl,
    setUrl: setImageUrl,
    upload: uploadCover,
  } = useImageUpload({
    endpoint: BEACON_IMAGE_ENDPOINT,
    acceptedMimeTypes: COVER_IMAGE_MIME_TYPES,
    compressOversize: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (initial?.imageUrl) setImageUrl(initial.imageUrl);
  }, [initial?.imageUrl, setImageUrl]);

  const writeBody = (latN: number, lngN: number) => ({
    lat: latN,
    lng: lngN,
    show_creator_name: showCreatorName,
    event_visibility: visibility,
    event_capacity: capacity,
    approval_required: approvalRequired,
    guest_list_visibility: guestListVisibility,
    cover_theme_id: coverThemeId,
    event_timezone: timeZone,
    ...(venueId ? { venue_id: venueId } : {}),
    metadata: {
      title: title.trim(),
      description: description.trim(),
      event_start_at: start.toISOString(),
      event_end_at: end.toISOString(),
      event_timezone: timeZone,
      location_name: locationName.trim(),
      image_url: imageUrl,
      rsvp_enabled: true,
      venue_scale: venueScale,
      event_categories: categories,
      cover_theme_id: coverThemeId,
      event_visibility: visibility,
      event_capacity: capacity,
      approval_required: approvalRequired,
      guest_list_visibility: guestListVisibility,
    },
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      setError("Search for a place or use your current location");
      return;
    }
    if (!locationName.trim()) {
      setError("Add a location name so guests know where to go");
      return;
    }
    if (end.getTime() <= start.getTime()) {
      setError("End must be after start");
      return;
    }

    setSubmitting(true);
    try {
      const headers = await getFreshAuthHeaders();
      if (isEdit && beaconId) {
        const res = await fetch(`/api/beacons/${beaconId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(writeBody(latN, lngN)),
        });
        const json = (await res.json()) as { beacon?: { id?: string }; error?: string };
        if (!res.ok || !json.beacon?.id) {
          setError(json.error || "Could not save event");
          return;
        }
        router.push(eventManagePath(beaconId));
        router.refresh();
        return;
      }

      const res = await fetch("/api/beacons", {
        method: "POST",
        headers,
        body: JSON.stringify({
          kind: "event",
          ...writeBody(latN, lngN),
        }),
      });
      const json = (await res.json()) as { beacon?: { id?: string }; error?: string };
      if (!res.ok || !json.beacon?.id) {
        setError(json.error || "Could not create event");
        return;
      }
      const id = json.beacon.id;
      setCreatedId(id);
      const url = `${window.location.origin}${eventSharePath(id)}`;
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        /* clipboard may be blocked */
      }
      router.push(eventManagePath(id));
    } catch {
      setError(isEdit ? "Could not save event" : "Could not create event");
    } finally {
      setSubmitting(false);
    }
  };

  const shareUrl =
    createdId && typeof window !== "undefined" ? `${window.location.origin}${eventSharePath(createdId)}` : null;

  return (
    <form onSubmit={onSubmit} className="relative space-y-8" data-testid="event-create-form">
      {submitting ? (
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 overflow-hidden rounded-full bg-primary/20"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          aria-hidden
        >
          <motion.div
            className="h-full w-1/3 rounded-full bg-primary"
            animate={reduceMotion ? undefined : { x: ["-100%", "300%"] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      ) : null}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-4">
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-on-surface">Cover</span>
            <label
              className={cn(
                "relative flex aspect-[4/5] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[16px] border border-dashed text-center transition-colors",
                dragOver ? "border-primary bg-primary/10" : "border-border-hard bg-surface-container-low hover:border-primary",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void uploadCover(file);
              }}
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <CardVisualHero
                  id="create-preview"
                  visualSeed={coverThemeId}
                  className="absolute inset-0 h-full w-full"
                />
              )}
              <div className="relative z-10 flex flex-col items-center gap-2 rounded-[12px] bg-black/35 px-4 py-3 text-white">
                <ImagePlus className="h-6 w-6" />
                <span className="text-sm font-medium">
                  {uploading ? "Preparing image…" : "Drop a photo or click to upload"}
                </span>
              </div>
              <input
                type="file"
                accept={COVER_IMAGE_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadCover(file);
                }}
              />
            </label>
            {coverUploadError ? (
              <p className="mt-1.5 text-sm text-error" role="alert">
                {coverUploadError}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-on-surface-variant">
                Large photos are compressed automatically before upload.
              </p>
            )}
          </div>
          <EventThemePicker value={coverThemeId} onChange={setCoverThemeId} />
        </div>

        <div className="space-y-6">
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            required
            placeholder="Event name"
            className="w-full border-0 border-b border-border-hard bg-transparent pb-2 font-display text-[32px] font-semibold leading-tight text-on-surface outline-none placeholder:text-on-surface-variant"
          />
          <FcTextarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="What should people know?"
          />
          <EventDateTimeFields
            start={start}
            end={end}
            timeZone={timeZone}
            onStartChange={setStart}
            onEndChange={setEnd}
          />
          <EventLocationPicker
            locationName={locationName}
            lat={lat}
            lng={lng}
            onLocationNameChange={setLocationName}
            onCoordsChange={(nextLat, nextLng) => {
              setLat(nextLat);
              setLng(nextLng);
            }}
          />
          <EventOptionsFields
            visibility={visibility}
            capacity={capacity}
            approvalRequired={approvalRequired}
            guestListVisibility={guestListVisibility}
            showCreatorName={showCreatorName}
            venueScale={venueScale}
            categories={categories}
            onVisibility={setVisibility}
            onCapacity={setCapacity}
            onApproval={setApprovalRequired}
            onGuestListVisibility={setGuestListVisibility}
            onShowCreatorName={setShowCreatorName}
            onVenueScale={setVenueScale}
            onCategories={setCategories}
          />
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <FcButton type="submit" className="w-full" disabled={submitting || uploading}>
            {submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create event"}
          </FcButton>
          {shareUrl ? (
            <p className="break-all text-xs text-on-surface-variant">
              {copied ? "Link copied. " : ""}
              {shareUrl}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
