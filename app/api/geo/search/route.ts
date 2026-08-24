import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, READ_HEAVY_RATE_LIMIT_BINDING } from "@/lib/server/rateLimit";
import { clientIpFromRequest } from "@/lib/events/eventMetadata";
import { searchNominatimPlaces } from "@/lib/server/nominatim";

/** Unauthenticated Nominatim proxy; IP-rate-limited below. */
export const publicRoute = true;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const ip = clientIpFromRequest(request);
  if (
    await isRateLimited({
      bindingName: READ_HEAVY_RATE_LIMIT_BINDING,
      key: `geo-search:${ip}`,
      limit: 20,
      windowMs: 60_000,
    })
  ) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const results = await searchNominatimPlaces(q);
    return NextResponse.json({ results });
  } catch (e) {
    console.error("GET /api/geo/search:", e);
    return NextResponse.json({ error: "Location search failed" }, { status: 502 });
  }
}
