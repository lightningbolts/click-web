/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/beacons/[beaconId]/event-chat/route";

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockCreateAdminSupabaseClient = jest.fn();
const mockLoadEventBeaconOrResponse = jest.fn();
const mockEnsureEventHubForBeacon = jest.fn();
const mockAssertHubReadable = jest.fn();
const mockParticipantUpsert = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/server/supabaseRouteAuth", () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock("@/lib/server/admin/supabaseAdmin", () => ({
  createAdminSupabaseClient: () => mockCreateAdminSupabaseClient(),
}));

jest.mock("@/lib/server/eventEngagement", () => ({
  loadEventBeaconOrResponse: (...args: unknown[]) => mockLoadEventBeaconOrResponse(...args),
}));

jest.mock("@/lib/server/eventHubRepair", () => ({
  ensureEventHubForBeacon: (...args: unknown[]) => mockEnsureEventHubForBeacon(...args),
}));

jest.mock("@/lib/server/hubGatekeeper", () => ({
  assertHubReadable: (...args: unknown[]) => mockAssertHubReadable(...args),
}));

const BEACON_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HUB_ID = "hub_event_test";
const ADMIN = { from: mockFrom };
const EXPIRES_AT = "2026-10-01T00:00:00.000Z";

function request() {
  return new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/event-chat`);
}

function context() {
  return { params: Promise.resolve({ beaconId: BEACON_ID }) };
}

function hub(repaired = false) {
  return {
    hub: {
      id: HUB_ID,
      name: "Machine Learning",
      creator_id: USER_ID,
      event_beacon_id: BEACON_ID,
      expires_at: EXPIRES_AT,
    },
    repaired,
  };
}

describe("event chat resolver", () => {
  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
    mockCreateAdminSupabaseClient.mockReset();
    mockLoadEventBeaconOrResponse.mockReset();
    mockEnsureEventHubForBeacon.mockReset();
    mockAssertHubReadable.mockReset();
    mockParticipantUpsert.mockReset();
    mockFrom.mockReset();

    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {},
      user: { id: USER_ID },
      authError: null,
    });
    mockCreateAdminSupabaseClient.mockReturnValue(ADMIN);
    mockLoadEventBeaconOrResponse.mockResolvedValue({
      beacon: {
        id: BEACON_ID,
        creator_id: USER_ID,
        metadata: { title: "Machine Learning", event_end_at: EXPIRES_AT },
        lat: 47.655,
        lng: -122.303,
        expires_at: EXPIRES_AT,
      },
    });
    mockEnsureEventHubForBeacon.mockResolvedValue(hub(false));
    mockAssertHubReadable.mockResolvedValue(null);
    mockParticipantUpsert.mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table !== "hub_participants") throw new Error(`Unexpected table ${table}`);
      return { upsert: mockParticipantUpsert };
    });
  });

  it("returns the canonical hub after the gatekeeper authorizes access", async () => {
    const res = await GET(request(), context());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      event_id: BEACON_ID,
      hub_id: HUB_ID,
      title: "Machine Learning",
      creator_id: USER_ID,
      repaired: false,
    });
    expect(mockLoadEventBeaconOrResponse).toHaveBeenCalledWith(ADMIN, BEACON_ID, {
      allowExpired: true,
    });
    expect(mockEnsureEventHubForBeacon).toHaveBeenCalledWith(ADMIN, {
      beaconId: BEACON_ID,
      creatorId: USER_ID,
      lat: 47.655,
      lng: -122.303,
      metadata: { title: "Machine Learning", event_end_at: EXPIRES_AT },
      expiresAt: EXPIRES_AT,
    });
    expect(mockAssertHubReadable).toHaveBeenCalledWith(ADMIN, HUB_ID, USER_ID);
    expect(mockParticipantUpsert).toHaveBeenCalledWith(
      { hub_id: HUB_ID, user_id: USER_ID },
      { onConflict: "hub_id,user_id", ignoreDuplicates: true },
    );
  });

  it("returns a repaired canonical hub for a legacy active event", async () => {
    mockEnsureEventHubForBeacon.mockResolvedValue(hub(true));

    const res = await GET(request(), context());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.hub_id).toBe(HUB_ID);
    expect(json.repaired).toBe(true);
    expect(mockAssertHubReadable).toHaveBeenCalledWith(ADMIN, HUB_ID, USER_ID);
  });

  it("returns a bounded retry state only when repair cannot produce a canonical hub", async () => {
    mockEnsureEventHubForBeacon.mockResolvedValue({
      hub: null,
      repaired: false,
      reason: "create_failed",
      detail: "database unavailable",
    });

    const res = await GET(request(), context());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("EVENT_HUB_NOT_READY");
    expect(mockAssertHubReadable).not.toHaveBeenCalled();
  });

  it("does not create a missing hub for an already-expired legacy event", async () => {
    mockEnsureEventHubForBeacon.mockResolvedValue({
      hub: null,
      repaired: false,
      reason: "expired",
    });

    const res = await GET(request(), context());
    const json = await res.json();

    expect(res.status).toBe(410);
    expect(json.error).toBe("HUB_EXPIRED");
    expect(mockAssertHubReadable).not.toHaveBeenCalled();
  });

  it("forwards RSVP denial from the authoritative hub gatekeeper", async () => {
    mockAssertHubReadable.mockResolvedValue(
      NextResponse.json(
        {
          error: "EVENT_HUB_ACCESS_DENIED",
          message: "RSVP to this event to join its chat.",
        },
        { status: 403 },
      ),
    );

    const res = await GET(request(), context());
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("EVENT_HUB_ACCESS_DENIED");
    expect(mockParticipantUpsert).not.toHaveBeenCalled();
  });

  it("forwards the expired terminal state from the hub gatekeeper", async () => {
    mockAssertHubReadable.mockResolvedValue(
      NextResponse.json(
        { error: "HUB_EXPIRED", message: "This hub is no longer active." },
        { status: 410 },
      ),
    );

    const res = await GET(request(), context());
    const json = await res.json();

    expect(res.status).toBe(410);
    expect(json.error).toBe("HUB_EXPIRED");
    expect(mockParticipantUpsert).not.toHaveBeenCalled();
  });

  it("does not expose a resolver target without authentication", async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: null,
      user: null,
      authError: new Error("missing auth"),
    });

    const res = await GET(request(), context());

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("UNAUTHORIZED");
    expect(mockCreateAdminSupabaseClient).not.toHaveBeenCalled();
  });
});
