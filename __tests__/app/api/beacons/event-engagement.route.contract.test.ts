/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import {
  GET as getBookmark,
  PUT as putBookmark,
  DELETE as deleteBookmark,
} from "@/app/api/beacons/[beaconId]/bookmark/route";
import {
  GET as getCheckIn,
  POST as postCheckIn,
} from "@/app/api/beacons/[beaconId]/check-in/route";
import { GET as getEngagement } from "@/app/api/beacons/[beaconId]/engagement/route";
import { POST as postImpression } from "@/app/api/beacons/[beaconId]/impressions/route";
import { POST as postShare } from "@/app/api/beacons/[beaconId]/share/route";
import { POST as postRsvp, DELETE as deleteRsvp } from "@/app/api/beacons/[beaconId]/rsvp/route";

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockCreateAdminSupabaseClient = jest.fn();

jest.mock("@/lib/server/supabaseRouteAuth", () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock("@/lib/server/admin/supabaseAdmin", () => ({
  createAdminSupabaseClient: () => mockCreateAdminSupabaseClient(),
}));

const BEACON_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function futureIso(hours = 24): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

function pastIso(hours = 1): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function liveEventMeta(lat = 47.65, lng = -122.3) {
  return {
    title: "Test Event",
    event_start_at: pastIso(1),
    event_end_at: futureIso(2),
    venue_scale: "neighborhood",
    check_in_radius_meters: 250,
    // unused by parser; location comes from geography field
    _pin: { lat, lng },
  };
}

type TableHandlers = Record<string, unknown>;

function chainSelect(result: { data: unknown; error: unknown; count?: number }) {
  const terminal = {
    maybeSingle: jest.fn().mockResolvedValue(result),
    single: jest.fn().mockResolvedValue(result),
    then: undefined as unknown,
  };
  const builder: Record<string, unknown> = {
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    maybeSingle: terminal.maybeSingle,
    single: terminal.single,
  };
  // head count queries resolve as promise-like via awaiting the builder in supabase-js;
  // our routes await `{ count, error }` from select with head — mock as resolved value when awaited.
  (builder as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolve({ data: result.data, error: result.error, count: result.count ?? null }));
  return builder;
}

function makeAdmin(handlers: TableHandlers) {
  return {
    from: jest.fn((table: string) => {
      const h = handlers[table];
      if (typeof h === "function") return (h as (table: string) => unknown)(table);
      if (h != null) return h;
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

const EVENT_HUB_ID = "hub_event_test";

function eventHubTables(hubId = EVENT_HUB_ID) {
  return {
    hub_venues: {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              id: hubId,
              name: "Test Event",
              creator_id: USER_ID,
              event_beacon_id: BEACON_ID,
              expires_at: futureIso(),
            },
            error: null,
          }),
        }),
      }),
    },
    hub_participants: {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    },
  };
}

describe("event engagement API contracts", () => {
  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockReset();
    mockCreateAdminSupabaseClient.mockReset();
  });

  it("bookmark PUT set/unset is idempotent and emits telemetry", async () => {
    const engagementInserts: unknown[] = [];
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });

    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {},
      user: { id: USER_ID },
      authError: null,
    });

    mockCreateAdminSupabaseClient.mockReturnValue(
      makeAdmin({
        map_beacons: {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: BEACON_ID,
                  beacon_type: "event",
                  expires_at: futureIso(),
                  venue_id: null,
                  metadata: liveEventMeta(),
                  location: { type: "Point", coordinates: [-122.3, 47.65] },
                },
                error: null,
              }),
            }),
          }),
        },
        event_bookmarks: {
          upsert,
          delete: del,
          select: jest.fn().mockReturnValue(
            chainSelect({ data: { beacon_id: BEACON_ID }, error: null }),
          ),
        },
        event_engagement_events: {
          insert: jest.fn((row: unknown) => {
            engagementInserts.push(row);
            return Promise.resolve({ error: null });
          }),
        },
      }),
    );

    const putReq = new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/bookmark`, {
      method: "PUT",
      body: JSON.stringify({ bookmarked: true, platform: "ios" }),
    });
    const putRes = await putBookmark(putReq, { params: Promise.resolve({ beaconId: BEACON_ID }) });
    expect(putRes.status).toBe(200);
    expect(upsert).toHaveBeenCalled();
    expect(engagementInserts.some((r) => (r as { event_type: string }).event_type === "bookmark_set")).toBe(
      true,
    );

    const delRes = await deleteBookmark(
      new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/bookmark`, { method: "DELETE" }),
      { params: Promise.resolve({ beaconId: BEACON_ID }) },
    );
    expect(delRes.status).toBe(200);

    const getRes = await getBookmark(
      new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/bookmark`),
      { params: Promise.resolve({ beaconId: BEACON_ID }) },
    );
    expect(getRes.status).toBe(200);
  });

  it("check-in rejects far coords with 403 and check_in_rejected", async () => {
    const engagementInserts: unknown[] = [];

    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {},
      user: { id: USER_ID },
      authError: null,
    });

    mockCreateAdminSupabaseClient.mockReturnValue(
      makeAdmin({
        map_beacons: {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: BEACON_ID,
                  beacon_type: "event",
                  expires_at: futureIso(),
                  venue_id: null,
                  metadata: liveEventMeta(),
                  location: { type: "Point", coordinates: [-122.3, 47.65] },
                },
                error: null,
              }),
            }),
          }),
        },
        event_engagement_events: {
          insert: jest.fn((row: unknown) => {
            engagementInserts.push(row);
            return Promise.resolve({ error: null });
          }),
        },
      }),
    );

    const res = await postCheckIn(
      new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/check-in`, {
        method: "POST",
        body: JSON.stringify({ latitude: 47.0, longitude: -122.0 }),
      }),
      { params: Promise.resolve({ beaconId: BEACON_ID }) },
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.reject_reason).toBe("out_of_bounds");
    expect(
      engagementInserts.some((r) => (r as { event_type: string }).event_type === "check_in_rejected"),
    ).toBe(true);
  });

  it("check-in accepts inside radius during live window", async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {},
      user: { id: USER_ID },
      authError: null,
    });

    const upsert = jest.fn().mockResolvedValue({ error: null });

    mockCreateAdminSupabaseClient.mockReturnValue(
      makeAdmin({
        map_beacons: {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: BEACON_ID,
                  beacon_type: "event",
                  expires_at: futureIso(),
                  venue_id: null,
                  metadata: liveEventMeta(),
                  location: { type: "Point", coordinates: [-122.3, 47.65] },
                },
                error: null,
              }),
            }),
          }),
        },
        beacon_attendees: {
          select: jest.fn().mockReturnValue(chainSelect({ data: null, error: null })),
        },
        event_bookmarks: {
          select: jest.fn().mockReturnValue(chainSelect({ data: null, error: null })),
        },
        event_check_ins: {
          select: jest.fn().mockReturnValue(chainSelect({ data: null, error: null, count: 1 })),
          upsert,
        },
        event_engagement_events: {
          insert: jest.fn().mockResolvedValue({ error: null }),
        },
        ...eventHubTables(),
      }),
    );

    const res = await postCheckIn(
      new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/check-in`, {
        method: "POST",
        body: JSON.stringify({ latitude: 47.6501, longitude: -122.3001, platform: "android" }),
      }),
      { params: Promise.resolve({ beaconId: BEACON_ID }) },
    );
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalled();
    expect((await res.json()).hub_id).toBe(EVENT_HUB_ID);
  });

  it("engagement GET returns bookmark + check-in flags", async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {},
      user: { id: USER_ID },
      authError: null,
    });

    mockCreateAdminSupabaseClient.mockReturnValue(
      makeAdmin({
        map_beacons: {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: BEACON_ID,
                  beacon_type: "event",
                  expires_at: futureIso(),
                  venue_id: null,
                  metadata: liveEventMeta(),
                  location: { type: "Point", coordinates: [-122.3, 47.65] },
                },
                error: null,
              }),
            }),
          }),
        },
        event_bookmarks: {
          select: jest.fn().mockReturnValue(
            chainSelect({ data: { beacon_id: BEACON_ID }, error: null }),
          ),
        },
        event_check_ins: {
          select: jest.fn().mockReturnValue(
            chainSelect({
              data: { checked_in_at: pastIso(0.1), checked_out_at: null },
              error: null,
              count: 3,
            }),
          ),
        },
        ...eventHubTables(),
      }),
    );

    const res = await getEngagement(
      new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/engagement`),
      { params: Promise.resolve({ beaconId: BEACON_ID }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.bookmarked).toBe(true);
    expect(json.checked_in).toBe(true);
    expect(json.hub_id).toBe(EVENT_HUB_ID);
  });

  it("impressions POST writes event_view", async () => {
    const inserts: unknown[] = [];
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {},
      user: { id: USER_ID },
      authError: null,
    });
    mockCreateAdminSupabaseClient.mockReturnValue(
      makeAdmin({
        map_beacons: {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: BEACON_ID,
                  beacon_type: "event",
                  expires_at: futureIso(),
                  venue_id: null,
                  metadata: liveEventMeta(),
                  location: { type: "Point", coordinates: [-122.3, 47.65] },
                },
                error: null,
              }),
            }),
          }),
        },
        event_engagement_events: {
          insert: jest.fn((row: unknown) => {
            inserts.push(row);
            return Promise.resolve({ error: null });
          }),
        },
      }),
    );

    const res = await postImpression(
      new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/impressions`, {
        method: "POST",
        body: JSON.stringify({ surface: "detail", platform: "ios" }),
      }),
      { params: Promise.resolve({ beaconId: BEACON_ID }) },
    );
    expect(res.status).toBe(200);
    expect((inserts[0] as { event_type: string }).event_type).toBe("event_view");
  });

  it("share POST writes share event", async () => {
    const inserts: unknown[] = [];
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {},
      user: { id: USER_ID },
      authError: null,
    });
    mockCreateAdminSupabaseClient.mockReturnValue(
      makeAdmin({
        map_beacons: {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: BEACON_ID,
                  beacon_type: "event",
                  expires_at: futureIso(),
                  venue_id: null,
                  metadata: liveEventMeta(),
                  location: { type: "Point", coordinates: [-122.3, 47.65] },
                },
                error: null,
              }),
            }),
          }),
        },
        event_engagement_events: {
          insert: jest.fn((row: unknown) => {
            inserts.push(row);
            return Promise.resolve({ error: null });
          }),
        },
      }),
    );

    const res = await postShare(
      new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/share`, {
        method: "POST",
        body: JSON.stringify({
          surface: "detail",
          platform: "ios",
          share_url: `https://joinclick.co/e/${BEACON_ID}`,
        }),
      }),
      { params: Promise.resolve({ beaconId: BEACON_ID }) },
    );
    expect(res.status).toBe(200);
    expect((inserts[0] as { event_type: string }).event_type).toBe("share");
  });

  it("RSVP POST/DELETE emit rsvp_set / rsvp_unset", async () => {
    const inserts: unknown[] = [];
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {
        from: jest.fn(() => ({
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          }),
        })),
      },
      user: { id: USER_ID },
      authError: null,
    });

    mockCreateAdminSupabaseClient.mockReturnValue(
      makeAdmin({
        map_beacons: {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: BEACON_ID,
                  beacon_type: "event",
                  expires_at: futureIso(),
                  venue_id: null,
                  metadata: liveEventMeta(),
                  location: { type: "Point", coordinates: [-122.3, 47.65] },
                },
                error: null,
              }),
            }),
          }),
        },
        beacon_attendees: {
          ...chainSelect({ data: null, error: null, count: 0 }),
          upsert: jest.fn().mockResolvedValue({ error: null }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          }),
        },
        event_guest_rsvps: chainSelect({ data: [], error: null, count: 0 }),
        users: {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [{ id: USER_ID, name: "Ada", image: null, first_name: "Ada", last_name: "L" }],
              error: null,
            }),
          }),
        },
        event_engagement_events: {
          insert: jest.fn((row: unknown) => {
            inserts.push(row);
            return Promise.resolve({ error: null });
          }),
        },
      }),
    );

    const postRes = await postRsvp(
      new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ latitude: 47.65, longitude: -122.3 }),
      }),
      { params: Promise.resolve({ beaconId: BEACON_ID }) },
    );
    expect(postRes.status).toBe(200);

    const delRes = await deleteRsvp(
      new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/rsvp`, { method: "DELETE" }),
      { params: Promise.resolve({ beaconId: BEACON_ID }) },
    );
    expect(delRes.status).toBe(200);

    const types = inserts.map((r) => (r as { event_type: string }).event_type);
    expect(types).toContain("rsvp_set");
    expect(types).toContain("rsvp_unset");
  });

  it("check-in rejects far coords with 403 even when event is not live yet", async () => {
    // Regression: not_live used to short-circuit before geofence → mobile treated 409 as
    // "checked in early" from 12km+ away.
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {},
      user: { id: USER_ID },
      authError: null,
    });

    mockCreateAdminSupabaseClient.mockReturnValue(
      makeAdmin({
        map_beacons: {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: BEACON_ID,
                  beacon_type: "event",
                  expires_at: futureIso(48),
                  venue_id: null,
                  metadata: {
                    title: "Future Event",
                    event_start_at: futureIso(48),
                    event_end_at: futureIso(50),
                    venue_scale: "neighborhood",
                    check_in_radius_meters: 250,
                  },
                  location: { type: "Point", coordinates: [-122.3, 47.65] },
                },
                error: null,
              }),
            }),
          }),
        },
        event_engagement_events: {
          insert: jest.fn().mockResolvedValue({ error: null }),
        },
      }),
    );

    const res = await postCheckIn(
      new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/check-in`, {
        method: "POST",
        body: JSON.stringify({ latitude: 47.0, longitude: -122.0 }),
      }),
      { params: Promise.resolve({ beaconId: BEACON_ID }) },
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.reject_reason).toBe("out_of_bounds");
  });

  it("returns 401 without auth", async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {},
      user: null,
      authError: new Error("nope"),
    });
    const res = await getCheckIn(
      new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/check-in`),
      { params: Promise.resolve({ beaconId: BEACON_ID }) },
    );
    expect(res.status).toBe(401);
  });
});
