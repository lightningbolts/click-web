import {
  DEFAULT_MAP_LAYER_TOGGLES,
  mapLayerForBeacon,
  parseMapBeacon,
} from "@/lib/map/mapBeacons";

describe("map beacon layer taxonomy", () => {
  it("matches the app's event, social, soundtrack, alert, and other filters", () => {
    expect(mapLayerForBeacon("event")).toBe("events");
    expect(mapLayerForBeacon("recreation")).toBe("socialVibes");
    expect(mapLayerForBeacon("soundtrack")).toBe("soundtracks");
    expect(mapLayerForBeacon("hazard")).toBe("alertsUtilities");
    expect(mapLayerForBeacon("study")).toBe("alertsUtilities");
    expect(mapLayerForBeacon("hobby")).toBe("other");
    expect(Object.values(DEFAULT_MAP_LAYER_TOGGLES).every(Boolean)).toBe(true);
  });

  it("accepts the stored social and other beacon records from the API", () => {
    const base = {
      id: "beacon-1",
      creator_id: "user-1",
      venue_id: null,
      show_creator_name: true,
      visibility_audience: "everyone",
      lat: 47.6,
      lng: -122.3,
      metadata: {},
      created_at: "2030-01-01T00:00:00Z",
      expires_at: "2030-01-02T00:00:00Z",
    };
    expect(parseMapBeacon({ ...base, beacon_type: "recreation" })?.beacon_type).toBe(
      "recreation",
    );
    expect(parseMapBeacon({ ...base, beacon_type: "hobby" })?.beacon_type).toBe("hobby");
  });
});
