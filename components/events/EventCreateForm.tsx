"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { FcButton, FcTextarea } from "@/components/fc";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import {
  BEACON_IMAGE_ENDPOINT,
  COVER_IMAGE_ACCEPT,
  COVER_IMAGE_MIME_TYPES,
} from "@/lib/uploads/constants";
import { useImageUpload } from "@/lib/uploads/useImageUpload";
import { eventSharePath } from "@/lib/events/eventUrls";
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
import { cn } from "@/lib/cn";

type EventCreateFormProps = {
  venueId?: string | null;
  defaultLat?: number | null;
  defaultLng?: number | null;
  defaultLocationName?: string | null;
};

export default function EventCreateForm({
  venueId = null,
  defaultLat = null,
  defaultLng = null,
  defaultLocationName = null,
}: EventCreateFormProps) {
  const router = useRouter();
  const initialWindow = useMemo(() => defaultEventWindow(), []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState(initialWindow.start);
  const [end, setEnd] = useState(initialWindow.end);
  const [timeZone] = useState(() => resolvedTimeZone());
  const [locationName, setLocationName] = useState(defaultLocationName ?? "");
  const [lat, setLat] = useState(defaultLat != null ? String(defaultLat) : "");
  const [lng, setLng] = useState(defaultLng != null ? String(defaultLng) : "");
  const [coverThemeId, setCoverThemeId] = useState<string>(EVENT_COVER_THEME_IDS[0]);
  const [visibility, setVisibility] = useState<EventVisibility>(
    DEFAULT_EVENT_LISTING_OPTIONS.event_visibility,
  );
  const [capacity, setCapacity] = useState<number | null>(null);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [guestListVisibility, setGuestListVisibility] = useState<GuestListVisibility>("public");
  const [showCreatorName, setShowCreatorName] = useState(true);
  const [venueScale, setVenueScale] = useState<"intimate" | "neighborhood" | "venue" | "campus">(
    "neighborhood",
  );
  const [categories, setCategories] = useState<string[]>([]);
  const {
    uploading,
    error: coverUploadError,
    url: imageUrl,
    upload: uploadCover,
  } = useImageUpload({
    endpoint: BEACON_IMAGE_ENDPOINT,
    acceptedMimeTypes: COVER_IMAGE_MIME_TYPES,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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
      const res = await fetch("/api/beacons", {
        method: "POST",
        headers,
        body: JSON.stringify({
          kind: "event",
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
      router.push(`/e/${id}/manage`);
    } catch {
      setError("Could not create event");
    } finally {
      setSubmitting(false);
    }
  };

  const shareUrl =
    createdId && typeof window !== "undefined" ? `${window.location.origin}${eventSharePath(createdId)}` : null;

  return (
    <form onSubmit={onSubmit} className="space-y-8" data-testid="event-create-form">
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
                  {uploading ? "Uploading…" : "Drop a photo or click to upload"}
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
            ) : null}
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
            {submitting ? "Creating…" : "Create event"}
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
