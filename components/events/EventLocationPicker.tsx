"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import { FcInput } from "@/components/fc";

type Place = { label: string; lat: number; lng: number };

type EventLocationPickerProps = {
  locationName: string;
  lat: string;
  lng: string;
  onLocationNameChange: (value: string) => void;
  onCoordsChange: (lat: string, lng: string) => void;
};

export default function EventLocationPicker({
  locationName,
  lat,
  lng,
  onLocationNameChange,
  onCoordsChange,
}: EventLocationPickerProps) {
  const [query, setQuery] = useState(locationName);
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(locationName);
  }, [locationName]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`);
          const json = (await res.json()) as { results?: Place[] };
          setResults(Array.isArray(json.results) ? json.results : []);
          setOpen(true);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 350);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (place: Place) => {
    onLocationNameChange(place.label);
    onCoordsChange(String(place.lat), String(place.lng));
    setQuery(place.label);
    setResults([]);
    setOpen(false);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const nextLat = pos.coords.latitude;
        const nextLng = pos.coords.longitude;
        onCoordsChange(String(nextLat), String(nextLng));
        try {
          const res = await fetch(
            `/api/geo/reverse?lat=${encodeURIComponent(String(nextLat))}&lng=${encodeURIComponent(String(nextLng))}`,
          );
          const json = (await res.json()) as { result?: Place | null };
          if (json.result?.label) {
            onLocationNameChange(json.result.label);
            setQuery(json.result.label);
          } else {
            onLocationNameChange("Current location");
            setQuery("Current location");
          }
        } catch {
          onLocationNameChange("Current location");
          setQuery("Current location");
        } finally {
          setGeoBusy(false);
        }
      },
      () => setGeoBusy(false),
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  };

  const pinned = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== "" && lng !== "";

  return (
    <div className="space-y-2" ref={wrapRef}>
      <div className="relative min-w-0">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
        <FcInput
          name="location_name"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onLocationNameChange(e.target.value);
          }}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder="Search a park, hall, or address"
          autoComplete="off"
          className="pl-9 pr-12"
        />
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geoBusy}
          aria-label={geoBusy ? "Locating" : "Use my location"}
          title={geoBusy ? "Locating…" : "Use my location"}
          className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-[8px] text-secondary hover:bg-surface-container-low disabled:opacity-40"
        >
          <Navigation className="h-4 w-4" />
        </button>
        {open && results.length > 0 ? (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-[12px] border border-border-hard bg-surface shadow-lg">
            {results.map((place) => (
              <li key={`${place.lat},${place.lng},${place.label}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2.5 text-left text-sm text-on-surface hover:bg-surface-container-low"
                  onClick={() => pick(place)}
                >
                  {place.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <input type="hidden" name="lat" value={lat} required />
      <input type="hidden" name="lng" value={lng} required />
      <p className="text-xs text-on-surface-variant">
        {searching
          ? "Searching places…"
          : geoBusy
            ? "Locating…"
            : pinned
              ? "Location pinned. Guests will get an open-map link."
              : "Search or use your location so the event has a map pin."}
      </p>
    </div>
  );
}
