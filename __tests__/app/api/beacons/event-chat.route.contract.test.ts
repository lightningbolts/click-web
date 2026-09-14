/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/beacons/[beaconId]/event-chat/route";

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockCreateAdminSupabaseClient = jest.fn();
const mockLoadEventBeaconOrResponse = jest.fn();
const mockFindHubForEventBeacon = jest.fn();
const mockAssertHubReadable = jest.fn();

jest.mock("@/lib/server/supabaseRouteAuth", () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock("@/lib/server/admin/supabaseAdmin", () => ({
  createAdminSupabaseClient: () => mockCreateAdminSupabaseClient(),
}));

jest.mock("@/lib/server/eventEngagement", () => ({
  loadEventBeaconOrResponse: (...args: unknown[]) => mockLoadEventBeaconOrResponse(...args),
}));

jest.mock("@/lib/server/eventHubLifecycle", () => ({
  findHubForEventBeacon: (...args: unknown[]) => mockFindHubForEventBeacon(...args),
}));

jest.mock("@/lib/server/hubGatekeeper", () => ({
  assertHubReadable: (...args: unknown[]) => mockAssertHubReadable(...args),
}));

const BEACON_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HUB_ID = "hub_event_test";
const ADMIN = { tag: "admin" };

function request() {
  return new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/event-chat`);
}

function context() {
  return { params: Promise.resolve({ beaconId: BEACON_ID }) };
}

describe("event chat resolver", () => {
  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
    mockCreateAdminSupabaseClient.mockReset();
    mockLoadEventBeaconOrResponse.mockReset();
    mockFindHubForEventBeacon.mockReset();
    mockAssertHubReadable.mockReset();

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
        metadata: { title: "Machine Learning" },
      },
    });
    mockFindHubForEventBeacon.mockResolvedValue({
      id: HUB_ID,
      name: "Machine Learning",
      creator_id: USER_ID,
      event_beacon_id: BEACON_ID,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    mockAssertHubReadable.mockResolvedValue(null);
  });

  it("returns the canonical hub after the gatekeeper authorizes access", async () => {
    const res = await GET(request(), context());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      event_id: BEACON_ID,
      hub_id: HUB_ID,
      title: "Machine Learning",
      creator_id: USER_ID,
    });
    expect(mockLoadEventBeaconOrResponse).toHaveBeenCalledWith(ADMIN, BEACON_ID, {
      allowExpired: true,
    });
    expect(mockFindHubForEventBeacon).toHaveBeenCalledWith(ADMIN, BEACON_ID);
    expect(mockAssertHubReadable).toHaveBeenCalledWith(ADMIN, HUB_ID, USER_ID);
  });

  it("returns a bounded retry state when the event-hub relation is not ready", async () => {
    mockFindHubForEventBeacon.mockResolvedValue(null);

    const res = await GET(request(), context());
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("EVENT_HUB_NOT_READY");
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
