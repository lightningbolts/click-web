/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const mockCreateAdminSupabaseClient = jest.fn();
const mockLoadPublicUpcomingEvents = jest.fn();
const mockLoadPublicEventPayload = jest.fn();
const mockIsRateLimited = jest.fn();
const mockLoadEventBeaconOrResponse = jest.fn();
const mockNormalizeGuestContact = jest.fn();
const mockRsvpEnabledFromMetadata = jest.fn();

jest.mock("@/lib/server/admin/supabaseAdmin", () => ({
  createAdminSupabaseClient: () => mockCreateAdminSupabaseClient(),
}));

jest.mock("@/lib/events/publicEvent", () => ({
  loadPublicUpcomingEvents: (...args: unknown[]) => mockLoadPublicUpcomingEvents(...args),
  loadPublicEventPayload: (...args: unknown[]) => mockLoadPublicEventPayload(...args),
}));

jest.mock("@/lib/server/rateLimit", () => ({
  isRateLimited: (...args: unknown[]) => mockIsRateLimited(...args),
}));

jest.mock("@/lib/server/eventEngagement", () => ({
  loadEventBeaconOrResponse: (...args: unknown[]) => mockLoadEventBeaconOrResponse(...args),
}));

jest.mock("@/lib/events/eventMetadata", () => {
  const actual = jest.requireActual("@/lib/events/eventMetadata") as Record<string, unknown>;
  return {
    ...actual,
    normalizeGuestContact: (...args: unknown[]) => mockNormalizeGuestContact(...args),
    rsvpEnabledFromMetadata: (...args: unknown[]) => mockRsvpEnabledFromMetadata(...args),
  };
});

const BEACON_ID = "11111111-1111-4111-8111-111111111111";

describe("GET /api/beacons/public-events", () => {
  it("returns upcoming public events without auth", async () => {
    mockLoadPublicUpcomingEvents.mockResolvedValue([
      { beacon_id: BEACON_ID, title: "Picnic", event_start_at: "2026-08-24T18:00:00.000Z" },
    ]);
    const { GET } = await import("@/app/api/beacons/public-events/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { events: Array<{ title: string }> };
    expect(json.events[0]?.title).toBe("Picnic");
  });
});

describe("POST /api/beacons/[beaconId]/rsvp/guest", () => {
  beforeEach(() => {
    mockIsRateLimited.mockResolvedValue(false);
    mockNormalizeGuestContact.mockReturnValue({ contact: "ada@example.com" });
    mockRsvpEnabledFromMetadata.mockReturnValue(true);
    mockLoadEventBeaconOrResponse.mockResolvedValue({
      beacon: { id: BEACON_ID, metadata: {}, beacon_type: "event" },
    });
    const insert = jest.fn().mockResolvedValue({ error: null });
    const eq = jest.fn().mockResolvedValue({ data: [], error: null });
    const select = jest.fn().mockReturnValue({ eq });
    mockCreateAdminSupabaseClient.mockReturnValue({
      from: jest.fn().mockReturnValue({ select, insert, eq }),
    });
  });

  it("accepts name and contact without a session", async () => {
    const { POST } = await import("@/app/api/beacons/[beaconId]/rsvp/guest/route");
    const req = new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/rsvp/guest`, {
      method: "POST",
      body: JSON.stringify({ name: "Ada", contact: "ada@example.com" }),
    });
    const res = await POST(req, { params: Promise.resolve({ beaconId: BEACON_ID }) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("rejects invalid contact", async () => {
    mockNormalizeGuestContact.mockReturnValue({ error: "Use an email address or phone number" });
    const { POST } = await import("@/app/api/beacons/[beaconId]/rsvp/guest/route");
    const req = new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/rsvp/guest`, {
      method: "POST",
      body: JSON.stringify({ name: "Ada", contact: "nope" }),
    });
    const res = await POST(req, { params: Promise.resolve({ beaconId: BEACON_ID }) });
    expect(res.status).toBe(400);
  });
});
