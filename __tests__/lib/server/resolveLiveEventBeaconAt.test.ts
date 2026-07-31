/**
 * @jest-environment node
 */

import {
  applyLiveEventBeaconToEncounterRow,
  AT_EVENT_CONTEXT_TAG,
  resolveLiveEventBeaconAt,
} from "@/lib/server/resolveLiveEventBeaconAt";

const BEACON_ID = "11111111-1111-4111-8111-111111111111";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function pastIso(hours = 1): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}
function futureIso(hours = 2): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

function liveEventBeaconRpcRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BEACON_ID,
    creator_id: USER_A,
    venue_id: null,
    beacon_type: "event",
    show_creator_name: false,
    visibility_audience: "everyone",
    lat: 47.65,
    lng: -122.3,
    metadata: {
      title: "Park Party",
      event_start_at: pastIso(1),
      event_end_at: futureIso(2),
      venue_scale: "neighborhood",
      check_in_radius_meters: 250,
    },
    created_at: pastIso(24),
    expires_at: futureIso(24),
    ...overrides,
  };
}

/** Dual-table mock: `beacon_attendees` + `event_check_ins` (thenable query chain). */
function mockFromTables(tables: Record<string, { data: unknown; error: null }>) {
  return jest.fn().mockImplementation((table: string) => {
    const result = tables[table] ?? { data: [], error: null };
    const builder: {
      select: jest.Mock;
      eq: jest.Mock;
      in: jest.Mock;
      is: jest.Mock;
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => Promise<unknown>;
    } = {
      select: jest.fn(),
      eq: jest.fn(),
      in: jest.fn(),
      is: jest.fn(),
      then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.in.mockReturnValue(builder);
    builder.is.mockReturnValue(builder);
    return builder;
  });
}

describe("resolveLiveEventBeaconAt", () => {
  it("attaches nearest live event when both users RSVPed and have active check-ins", async () => {
    const admin = {
      rpc: jest.fn().mockResolvedValue({
        data: [liveEventBeaconRpcRow()],
        error: null,
      }),
      from: mockFromTables({
        beacon_attendees: {
          data: [{ user_id: USER_A }, { user_id: USER_B }],
          error: null,
        },
        event_check_ins: {
          data: [{ user_id: USER_A }, { user_id: USER_B }],
          error: null,
        },
      }),
    };

    const attachment = await resolveLiveEventBeaconAt(
      admin as never,
      47.6501,
      -122.3001,
      [USER_A, USER_B],
    );
    expect(attachment?.event_beacon_id).toBe(BEACON_ID);
    expect(attachment?.event_beacon_title).toBe("Park Party");

    const row = applyLiveEventBeaconToEncounterRow(
      { context_tags: ["party"] },
      attachment,
    );
    expect(row.context_tags).toEqual(expect.arrayContaining(["party", AT_EVENT_CONTEXT_TAG]));
    expect(row.event_beacon_id).toBe(BEACON_ID);
  });

  it("returns null when one user has not RSVPed", async () => {
    const admin = {
      rpc: jest.fn().mockResolvedValue({
        data: [liveEventBeaconRpcRow()],
        error: null,
      }),
      from: mockFromTables({
        beacon_attendees: {
          data: [{ user_id: USER_A }],
          error: null,
        },
        event_check_ins: {
          data: [{ user_id: USER_A }, { user_id: USER_B }],
          error: null,
        },
      }),
    };

    const attachment = await resolveLiveEventBeaconAt(
      admin as never,
      47.6501,
      -122.3001,
      [USER_A, USER_B],
    );
    expect(attachment).toBeNull();
  });

  it("returns null when all RSVPed but one is missing an active check-in", async () => {
    const admin = {
      rpc: jest.fn().mockResolvedValue({
        data: [liveEventBeaconRpcRow()],
        error: null,
      }),
      from: mockFromTables({
        beacon_attendees: {
          data: [{ user_id: USER_A }, { user_id: USER_B }],
          error: null,
        },
        event_check_ins: {
          data: [{ user_id: USER_A }],
          error: null,
        },
      }),
    };

    const attachment = await resolveLiveEventBeaconAt(
      admin as never,
      47.6501,
      -122.3001,
      [USER_A, USER_B],
    );
    expect(attachment).toBeNull();
  });

  it("returns null when a check-in has checked_out_at set (not active)", async () => {
    // Query filters checked_out_at IS NULL, so checked-out rows are omitted from the result.
    const from = mockFromTables({
      beacon_attendees: {
        data: [{ user_id: USER_A }, { user_id: USER_B }],
        error: null,
      },
      event_check_ins: {
        data: [{ user_id: USER_A }],
        error: null,
      },
    });
    const admin = {
      rpc: jest.fn().mockResolvedValue({
        data: [liveEventBeaconRpcRow()],
        error: null,
      }),
      from,
    };

    const attachment = await resolveLiveEventBeaconAt(
      admin as never,
      47.6501,
      -122.3001,
      [USER_A, USER_B],
    );
    expect(attachment).toBeNull();
    expect(from).toHaveBeenCalledWith("event_check_ins");
    const checkInBuilder = from.mock.results.find(
      (_: unknown, i: number) => from.mock.calls[i]?.[0] === "event_check_ins",
    )?.value;
    expect(checkInBuilder?.is).toHaveBeenCalledWith("checked_out_at", null);
  });

  it("returns null when outside geofence", async () => {
    const admin = {
      rpc: jest.fn().mockResolvedValue({
        data: [
          liveEventBeaconRpcRow({
            metadata: {
              title: "Park Party",
              event_start_at: pastIso(1),
              event_end_at: futureIso(2),
              venue_scale: "intimate",
              check_in_radius_meters: 75,
            },
          }),
        ],
        error: null,
      }),
      from: mockFromTables({
        beacon_attendees: {
          data: [{ user_id: USER_A }, { user_id: USER_B }],
          error: null,
        },
        event_check_ins: {
          data: [{ user_id: USER_A }, { user_id: USER_B }],
          error: null,
        },
      }),
    };

    // ~1km away
    const attachment = await resolveLiveEventBeaconAt(
      admin as never,
      47.66,
      -122.3,
      [USER_A, USER_B],
    );
    expect(attachment).toBeNull();
  });
});
