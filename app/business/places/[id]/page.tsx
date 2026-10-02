"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { FcButton, FcCard, FcChip, FcField, FcInput, FcPageShell, FcTextarea } from "@/components/fc";
import PlaceStatsView from "@/components/places/PlaceStatsView";
import { useAuth } from "@/lib/AuthContext";
import { categoryLabel } from "@/lib/places/categories";
import { placeApi, placeStatusLabel, type ManagerPlace } from "@/lib/places/managerClient";
import type { PlaceStats } from "@/lib/server/places/stats";

type Tab = "profile" | "stats" | "poster";
type Anchor = { id: string; name: string; check_in_url: string };

const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "stats", label: "Stats" },
  { id: "poster", label: "QR poster" },
];

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="text-sm font-semibold text-on-surface">{value || "—"}</p>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function ProfileTab({ place, onSaved }: { place: ManagerPlace; onSaved: (p: ManagerPlace) => void }) {
  const canEdit = place.role !== "viewer";
  const [description, setDescription] = useState(place.description ?? "");
  const [hours, setHours] = useState(place.hours ? JSON.stringify(place.hours) : "");
  const [website, setWebsite] = useState(place.website_url ?? "");
  const [addressLine, setAddressLine] = useState(place.address_line ?? "");
  const [city, setCity] = useState(place.city ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setStatus(null);
    try {
      const { place: updated } = await placeApi<{ place: ManagerPlace }>(`/api/places/${place.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      onSaved(updated);
      setStatus("Saved.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let parsedHours: unknown = null;
    if (hours.trim()) {
      try {
        parsedHours = JSON.parse(hours);
      } catch {
        setStatus('Hours must be JSON like {"mon":[["07:00","15:00"]]}.');
        return;
      }
    }
    void save({
      description: description.trim() || null,
      hours: parsedHours,
      website_url: website.trim() || null,
      address_line: addressLine.trim() || null,
      city: city.trim() || null,
    });
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      await placeApi(`/api/places/${place.id}/photo`, {
        method: "POST",
        body: JSON.stringify({ file_b64: await fileToBase64(file), mime_type: file.type }),
      });
      setStatus("Photo updated.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <FcCard className="p-6">
        <form className="space-y-4" onSubmit={submit}>
          <FcField label="Description (500 characters)">
            <FcTextarea maxLength={500} rows={4} value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} />
          </FcField>
          <FcField label='Hours (JSON, e.g. {"mon":[["07:00","15:00"]]})'>
            <FcTextarea rows={3} value={hours} disabled={!canEdit} onChange={(e) => setHours(e.target.value)} />
          </FcField>
          <FcField label="Website (https://)">
            <FcInput type="url" value={website} disabled={!canEdit} onChange={(e) => setWebsite(e.target.value)} />
          </FcField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FcField label="Street address">
              <FcInput value={addressLine} disabled={!canEdit} onChange={(e) => setAddressLine(e.target.value)} />
            </FcField>
            <FcField label="City">
              <FcInput value={city} disabled={!canEdit} onChange={(e) => setCity(e.target.value)} />
            </FcField>
          </div>
          <FcField label="Cover photo (JPEG, PNG or WebP, 5 MB)">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={!canEdit || busy}
              onChange={(e) => void uploadPhoto(e.target.files?.[0])}
              className="text-sm"
            />
          </FcField>
          <label className="flex items-center gap-3 text-sm font-semibold text-on-surface">
            <input
              type="checkbox"
              checked={place.hub_enabled}
              disabled={!canEdit || busy}
              onChange={(e) => void save({ hub_enabled: e.target.checked })}
            />
            Place Hub (a permanent chat for people who check in)
          </label>
          {canEdit ? (
            <FcButton type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </FcButton>
          ) : (
            <p className="text-sm text-on-surface-variant">Your role can view this Place but not edit it.</p>
          )}
          {status ? <p className="text-sm font-semibold text-on-surface" role="status">{status}</p> : null}
        </form>
      </FcCard>
      <FcCard className="space-y-4 p-6">
        <ReadOnly label="Name" value={place.name} />
        <ReadOnly label="Category" value={categoryLabel(place.category)} />
        <ReadOnly label="Check-in radius" value={`${place.radius_meters} m`} />
        <ReadOnly label="Status" value={placeStatusLabel(place)} />
        <p className="text-xs text-on-surface-variant">Contact Click to change these.</p>
      </FcCard>
    </div>
  );
}

function StatsTab({ placeId }: { placeId: string }) {
  const [stats, setStats] = useState<PlaceStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    placeApi<PlaceStats>(`/api/places/${placeId}/stats?range=30d&detail=basic`)
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, [placeId]);
  if (error) return <p className="text-sm font-semibold text-red-600">{error}</p>;
  if (!stats) return <p className="text-sm text-on-surface-variant">Loading…</p>;
  return (
    <div className="space-y-4">
      <PlaceStatsView stats={stats} />
      <p className="text-xs text-on-surface-variant">
        Counts include only people who allow Business insights. No individual visits are ever shown.{" "}
        <Link href={`/insights/place?venue_id=${placeId}`} className="font-semibold text-primary hover:underline">
          90-day trends in Click Insights
        </Link>
      </p>
    </div>
  );
}

function PosterTab({ place }: { place: ManagerPlace }) {
  const [anchors, setAnchors] = useState<Anchor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    placeApi<{ anchors: Anchor[] }>(`/api/places/${place.id}/anchors`)
      .then((body) => setAnchors(body.anchors))
      .catch((e: Error) => setError(e.message));
  }, [place.id]);
  if (error) return <p className="text-sm font-semibold text-red-600">{error}</p>;
  if (!anchors) return <p className="text-sm text-on-surface-variant">Loading…</p>;
  if (anchors.length === 0) {
    return <p className="text-sm text-on-surface-variant">No check-in code yet. Click creates one when your Place is set up.</p>;
  }
  return (
    <div className="space-y-4">
      <FcButton type="button" className="print:hidden" onClick={() => window.print()}>
        Print
      </FcButton>
      <div className="grid gap-6 md:grid-cols-2 print:block">
        {anchors.map((anchor) => (
          <FcCard key={anchor.id} className="flex flex-col items-center gap-4 p-8 text-center print:mb-8 print:break-after-page print:border-0">
            <p className="text-2xl font-bold text-on-surface">{place.name}</p>
            <div className="rounded-lg bg-white p-4">
              <QRCodeSVG value={anchor.check_in_url} size={220} level="M" aria-label={`Check-in QR code for ${place.name}`} />
            </div>
            <p className="text-lg font-semibold text-on-surface">Scan to check in on Click</p>
            <p className="break-all text-[10px] text-on-surface-variant">{anchor.check_in_url}</p>
            <p className="text-xs text-on-surface-variant print:hidden">{anchor.name}</p>
          </FcCard>
        ))}
      </div>
    </div>
  );
}

/** /business/places/[id] — Profile, Stats and QR poster for one managed Place (§7.2). */
export default function BusinessPlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading } = useAuth();
  const [place, setPlace] = useState<ManagerPlace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("profile");

  const load = useCallback(() => {
    placeApi<{ places: ManagerPlace[] }>("/api/places/mine")
      .then((body) => {
        const found = body.places.find((p) => p.id === id);
        if (found) setPlace(found);
        else setError("You don't manage this Place.");
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/business/signup?next=/business/places/${id}`);
      return;
    }
    load();
  }, [loading, user, router, id, load]);

  return (
    <FcPageShell className="px-4 py-10 md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/business/places" className="text-sm font-semibold text-primary hover:underline print:hidden">
          ← Your Places
        </Link>
        {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
        {!place && !error ? <p className="text-sm text-on-surface-variant">Loading…</p> : null}
        {place ? (
          <>
            <div className="flex flex-wrap items-center gap-3 print:hidden">
              <h1 className="text-3xl font-bold text-on-surface">{place.name}</h1>
              <FcChip>{placeStatusLabel(place)}</FcChip>
            </div>
            <div role="tablist" aria-label="Place sections" className="flex gap-2 print:hidden">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-[8px] border-2 border-border-hard px-4 py-2 text-sm font-bold ${
                    tab === t.id ? "bg-primary text-on-primary" : "bg-surface text-on-surface hover:bg-surface-container-low"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab === "profile" ? <ProfileTab place={place} onSaved={setPlace} /> : null}
            {tab === "stats" ? <StatsTab placeId={place.id} /> : null}
            {tab === "poster" ? <PosterTab place={place} /> : null}
          </>
        ) : null}
      </div>
    </FcPageShell>
  );
}
