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

describe("resolveLiveEventBeaconAt", () => {
  it("attaches nearest live event when both users RSVPed", async () => {
    const admin = {
      rpc: jest.fn().mockResolvedValue({
        data: [
          {
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
          },
        ],
        error: null,
      }),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [{ user_id: USER_A }, { user_id: USER_B }],
              error: null,
            }),
          }),
        }),
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
        data: [
          {
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
          },
        ],
        error: null,
      }),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [{ user_id: USER_A }],
              error: null,
            }),
          }),
        }),
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

  it("returns null when outside geofence", async () => {
    const admin = {
      rpc: jest.fn().mockResolvedValue({
        data: [
          {
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
              venue_scale: "intimate",
              check_in_radius_meters: 75,
            },
            created_at: pastIso(24),
            expires_at: futureIso(24),
          },
        ],
        error: null,
      }),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [{ user_id: USER_A }, { user_id: USER_B }],
              error: null,
            }),
          }),
        }),
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
