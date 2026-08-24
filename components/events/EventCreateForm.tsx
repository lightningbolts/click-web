"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { FcButton, FcCard, FcField, FcInput, FcTextarea } from "@/components/fc";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import { eventSharePath } from "@/lib/events/eventUrls";
import EventLocationPicker from "@/components/events/EventLocationPicker";

type EventCreateFormProps = {
  venueId?: string | null;
  defaultLat?: number | null;
  defaultLng?: number | null;
  defaultLocationName?: string | null;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDatetimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultWindow(): { start: string; end: string } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { start: toDatetimeLocal(start), end: toDatetimeLocal(end) };
}

export default function EventCreateForm({
  venueId = null,
  defaultLat = null,
  defaultLng = null,
  defaultLocationName = null,
}: EventCreateFormProps) {
  const router = useRouter();
  const initialWindow = useMemo(defaultWindow, []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startLocal, setStartLocal] = useState(initialWindow.start);
  const [endLocal, setEndLocal] = useState(initialWindow.end);
  const [locationName, setLocationName] = useState(defaultLocationName ?? "");
  const [lat, setLat] = useState(defaultLat != null ? String(defaultLat) : "");
  const [lng, setLng] = useState(defaultLng != null ? String(defaultLng) : "");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const onUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Cover must be an image");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const headers = await getFreshAuthHeaders();
      const res = await fetch("/api/beacons/image", {
        method: "POST",
        headers,
        body: JSON.stringify({ file_b64: b64, mime_type: file.type || "image/jpeg" }),
      });
      const json = (await res.json()) as { image?: string; error?: string };
      if (!res.ok || !json.image) {
        setError(json.error || "Cover upload failed");
        return;
      }
      setImageUrl(json.image);
    } catch {
      setError("Cover upload failed");
    } finally {
      setUploading(false);
    }
  };

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
    if (!startLocal || !endLocal) {
      setError("Start and end times are required");
      return;
    }
    const startIso = new Date(startLocal).toISOString();
    const endIso = new Date(endLocal).toISOString();
    if (Date.parse(endIso) <= Date.parse(startIso)) {
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
          show_creator_name: true,
          visibility_audience: "everyone",
          ...(venueId ? { venue_id: venueId } : {}),
          metadata: {
            title: title.trim(),
            description: description.trim(),
            event_start_at: startIso,
            event_end_at: endIso,
            location_name: locationName.trim() || null,
            image_url: imageUrl,
            rsvp_enabled: true,
            venue_scale: "neighborhood",
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
      router.push(eventSharePath(id));
    } catch {
      setError("Could not create event");
    } finally {
      setSubmitting(false);
    }
  };

  const shareUrl =
    createdId && typeof window !== "undefined" ? `${window.location.origin}${eventSharePath(createdId)}` : null;

  return (
    <FcCard className="p-6 md:p-8">
      <form onSubmit={onSubmit} className="space-y-6" data-testid="event-create-form">
        <FcField label="Title">
          <FcInput
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            required
            placeholder="Community picnic"
          />
        </FcField>
        <FcField label="Description">
          <FcTextarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="What should people know?"
          />
        </FcField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FcField label="Starts">
            <FcInput
              type="datetime-local"
              name="event_start_at"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              required
            />
          </FcField>
          <FcField label="Ends">
            <FcInput
              type="datetime-local"
              name="event_end_at"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              required
            />
          </FcField>
        </div>
        <FcField label="Location">
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
        </FcField>
        <div className="flex w-full min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-on-surface">Cover image</span>
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed px-4 py-8 text-center transition-colors ${
              dragOver ? "border-secondary bg-secondary-container" : "border-border-hard bg-surface-container-low"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void onUpload(file);
            }}
          >
            <ImagePlus className="h-6 w-6 text-on-surface-variant" />
            <span className="text-sm font-medium text-on-surface">
              {uploading ? "Uploading…" : "Drop a photo or click to upload"}
            </span>
            <span className="text-xs text-on-surface-variant">JPEG, PNG, WebP, or GIF</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUpload(file);
              }}
            />
          </label>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-40 w-full rounded-[12px] object-cover" />
          ) : null}
        </div>
        {error ? <p className="text-sm text-error">{error}</p> : null}
        <FcButton type="submit" className="w-full sm:w-auto" disabled={submitting || uploading}>
          {submitting ? "Creating…" : "Create event"}
        </FcButton>
        {shareUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all text-xs text-on-surface-variant">{shareUrl}</code>
            <FcButton
              type="button"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </FcButton>
          </div>
        ) : null}
      </form>
    </FcCard>
  );
}
