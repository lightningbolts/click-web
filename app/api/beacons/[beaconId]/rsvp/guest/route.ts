import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadEventBeaconOrResponse } from "@/lib/server/eventEngagement";
import { isRateLimited } from "@/lib/server/rateLimit";
import { parseBody } from "@/lib/api/parseBody";
import { guestRsvpBodySchema } from "@/lib/api/schemas/beacons";
import {
  clientIpFromRequest,
  EVENT_BEACON_UUID_RE,
  normalizeGuestContact,
  rsvpEnabledFromMetadata,
} from "@/lib/events/eventMetadata";

/**
 * POST /api/beacons/{id}/rsvp/guest — unauthenticated name+contact interest capture.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    if (!EVENT_BEACON_UUID_RE.test(beaconId)) {
      return NextResponse.json({ error: "Invalid beacon id" }, { status: 400 });
    }

    const ip = clientIpFromRequest(request);
    if (
      await isRateLimited({
        bindingName: "READ_HEAVY_RATE_LIMITER",
        key: `guest-rsvp:${ip}:${beaconId}`,
        limit: 8,
        windowMs: 60_000,
      })
    ) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = await parseBody(request, guestRsvpBodySchema);
    if (!parsed.ok) return parsed.response;
    const name = parsed.data.name;
    const contact = normalizeGuestContact(parsed.data.contact);
    if ("error" in contact) {
      return NextResponse.json({ error: contact.error }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const loaded = await loadEventBeaconOrResponse(admin, beaconId, { allowExpired: true });
    if ("response" in loaded) return loaded.response;
    if (!rsvpEnabledFromMetadata(loaded.beacon.metadata)) {
      return NextResponse.json({ error: "RSVP is closed for this event" }, { status: 403 });
    }

    const { data: existingRows } = await admin
      .from("event_guest_rsvps")
      .select("id, contact")
      .eq("beacon_id", beaconId);
    const already =
      Array.isArray(existingRows) &&
      existingRows.some(
        (row) =>
          row != null &&
          typeof row === "object" &&
          "contact" in row &&
          typeof (row as { contact?: unknown }).contact === "string" &&
          String((row as { contact: string }).contact).toLowerCase() === contact.contact.toLowerCase(),
      );
    if (!already) {
      const { error: insertErr } = await admin.from("event_guest_rsvps").insert({
        beacon_id: beaconId,
        name,
        contact: contact.contact,
      });
      if (insertErr && !/duplicate|unique/i.test(insertErr.message)) {
        console.error("POST guest rsvp:", insertErr.message);
        return NextResponse.json({ error: "Failed to save RSVP" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/beacons/[beaconId]/rsvp/guest:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
