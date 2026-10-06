"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import dynamic from "next/dynamic";
import { IconButton } from "@/components/ds/IconButton";
import { Skeleton } from "@/components/ds/Skeleton";
import { fieldClassName } from "@/components/ds/TextField";
import { cn } from "@/lib/cn";

const PinMap = dynamic(() => import("@/components/maps/PinMap"), {
  ssr: false,
  loading: () => <Skeleton rounded="md" className="h-full w-full" />,
});

type Place = { label: string; lat: number; lng: number };

type EventLocationPickerProps = {
  locationName: string;
  lat: string;
  lng: string;
  onLocationNameChange: (value: string) => void;
  onCoordsChange: (lat: string, lng: string) => void;
  inputId?: string;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
};

export default function EventLocationPicker({
  locationName,
  lat,
  lng,
  onLocationNameChange,
  onCoordsChange,
  inputId = "event-location",
  onBlur,
  invalid,
  describedBy,
}: EventLocationPickerProps) {
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.clearTimeout(timer.current);
    };
  }, []);

  /** Search only on typing, so an edit form doesn't open suggestions for the saved name. */
  const search = (text: string) => {
    window.clearTimeout(timer.current);
    const q = text.trim();
    const mine = ++seq.current;
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    timer.current = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`);
          const json = (await res.json()) as { results?: Place[] };
          if (mine !== seq.current) return;
          const next = Array.isArray(json.results) ? json.results : [];
          setResults(next);
          setActive(-1);
          setOpen(next.length > 0);
        } catch {
          if (mine === seq.current) setResults([]);
        } finally {
          if (mine === seq.current) setSearching(false);
        }
      })();
    }, 350);
  };

  const pick = (place: Place) => {
    onLocationNameChange(place.label);
    onCoordsChange(String(place.lat), String(place.lng));
    seq.current++;
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
          } else {
            onLocationNameChange("Location shared privately");
          }
        } catch {
          onLocationNameChange("Location shared privately");
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
        <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary" aria-hidden />
        <input
          id={inputId}
          name="location_name"
          value={locationName}
          onChange={(e) => {
            onLocationNameChange(e.target.value);
            search(e.target.value);
          }}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open || results.length === 0) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (i + step + results.length) % results.length);
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            }
          }}
          onBlur={onBlur}
          placeholder="Search a park, hall, or address"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && results.length > 0}
          aria-controls={`${inputId}-results`}
          aria-activedescendant={open && active >= 0 ? `${inputId}-option-${active}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(fieldClassName, "h-11 pl-9 pr-12")}
        />
        {/* IconButton's 44 px hit area makes it `relative`, so position a wrapper instead. */}
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <IconButton
            icon={Navigation}
            size="sm"
            onClick={useMyLocation}
            disabled={geoBusy}
            aria-label={geoBusy ? "Locating" : "Use my location"}
          />
        </span>
        {open && results.length > 0 ? (
          <ul
            id={`${inputId}-results`}
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md bg-surface-raised py-1 shadow-lg ring-1 ring-hairline"
          >
            {results.map((place, i) => (
              <li
                key={`${place.lat},${place.lng},${place.label}`}
                id={`${inputId}-option-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click, so the input's blur doesn't close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(place);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn("type-body cursor-pointer px-3 py-2.5 text-fg", i === active && "bg-hover")}
              >
                {place.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />
      <p className="type-meta text-fg-tertiary" aria-live="polite">
        {searching
          ? "Searching places…"
          : geoBusy
            ? "Locating…"
            : pinned
              ? "Location pinned. Guests get an open-in-maps link."
              : "Search or use your location so the event has a map pin."}
      </p>
      {pinned ? (
        <PinMap
          testId="event-location-preview"
          className="h-40 rounded-md border-0"
          markers={[{ id: "draft", lat: Number(lat), lng: Number(lng), label: locationName }]}
        />
      ) : null}
    </div>
  );
}
