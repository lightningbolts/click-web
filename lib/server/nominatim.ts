const NOMINATIM_USER_AGENT = "ClickPlatformsApp/1.0 (contact@click.com)";

export type NominatimPlace = {
  label: string;
  lat: number;
  lng: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function placeFromRow(row: unknown): NominatimPlace | null {
  if (!isRecord(row)) return null;
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const display = typeof row.display_name === "string" ? row.display_name.trim() : "";
  const label = name || display;
  if (!label) return null;
  return { label, lat, lng };
}

async function nominatimGet(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": NOMINATIM_USER_AGENT,
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`Nominatim ${res.status}`);
  }
  return res.json();
}

export async function searchNominatimPlaces(query: string, limit = 5): Promise<NominatimPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&q=${encodeURIComponent(q)}`;
  const json = await nominatimGet(url);
  if (!Array.isArray(json)) return [];
  const out: NominatimPlace[] = [];
  for (const row of json) {
    const place = placeFromRow(row);
    if (place) out.push(place);
  }
  return out;
}

export async function reverseNominatimPlace(lat: number, lng: number): Promise<NominatimPlace | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`;
  const json = await nominatimGet(url);
  return placeFromRow(json);
}
