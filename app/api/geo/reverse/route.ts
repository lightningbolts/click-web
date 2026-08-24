import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, READ_HEAVY_RATE_LIMIT_BINDING } from "@/lib/server/rateLimit";
import { clientIpFromRequest } from "@/lib/events/eventMetadata";
import { reverseNominatimPlace } from "@/lib/server/nominatim";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const ip = clientIpFromRequest(request);
  if (
    await isRateLimited({
      bindingName: READ_HEAVY_RATE_LIMIT_BINDING,
      key: `geo-reverse:${ip}`,
      limit: 20,
      windowMs: 60_000,
    })
  ) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const result = await reverseNominatimPlace(lat, lng);
    return NextResponse.json({ result });
  } catch (e) {
    console.error("GET /api/geo/reverse:", e);
    return NextResponse.json({ error: "Reverse geocode failed" }, { status: 502 });
  }
}
