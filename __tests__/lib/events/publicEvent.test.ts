import { countEventRsvpsByBeaconIds, loadPublicEventPayload, loadPublicPastEvents, loadPublicUpcomingEvents } from "@/lib/events/publicEvent";

function thenableChain(result: { data: unknown; error: null }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.in = self;
  chain.order = self;
  chain.limit = self;
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

describe("countEventRsvpsByBeaconIds", () => {
  it("batches Click RSVPs and guest RSVPs per beacon", async () => {
    const admin = {
      from: (table: string) => {
        if (table === "beacon_attendees") {
          return thenableChain({
            data: [{ beacon_id: "a" }, { beacon_id: "a" }, { beacon_id: "b" }],
            error: null,
          });
        }
        if (table === "event_guest_rsvps") {
          return thenableChain({
            data: [{ beacon_id: "b" }],
            error: null,
          });
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const counts = await countEventRsvpsByBeaconIds(admin as never, ["a", "b", "a"]);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(2);
  });
});

describe("loadPublicUpcomingEvents", () => {
  it("attaches host names and batched RSVP counts", async () => {
    const start = new Date(Date.now() + 86_400_000).toISOString();
    const admin = {
      from: (table: string) => {
        if (table === "map_beacons") {
          return thenableChain({
            data: [
              {
                id: "evt-1",
                beacon_type: "event",
                visibility_audience: "everyone",
                creator_id: "user-1",
                show_creator_name: true,
                location: null,
                metadata: {
                  title: "Lawn hang",
                  description: "Bring a blanket.",
                  event_start_at: start,
                  location_name: "Cal Anderson Park",
                },
              },
              {
                id: "evt-2",
                beacon_type: "event",
                visibility_audience: "everyone",
                creator_id: "user-2",
                show_creator_name: false,
                location: null,
                metadata: {
                  title: "Private-looking public",
                  event_start_at: start,
                },
              },
            ],
            error: null,
          });
        }
        if (table === "beacon_attendees") {
          return thenableChain({ data: [{ beacon_id: "evt-1" }], error: null });
        }
        if (table === "event_guest_rsvps") {
          return thenableChain({ data: [{ beacon_id: "evt-1" }, { beacon_id: "evt-1" }], error: null });
        }
        if (table === "users") {
          return thenableChain({
            data: [{ id: "user-1", name: "Jordan Lee", first_name: "Jordan", last_name: "Lee" }],
            error: null,
          });
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const events = await loadPublicUpcomingEvents(admin as never);
    expect(events).toHaveLength(2);
    const lawn = events.find((event) => event.beacon_id === "evt-1");
    expect(lawn?.title).toBe("Lawn hang");
    expect(lawn?.description).toBe("Bring a blanket.");
    expect(lawn?.host_name).toBe("Jordan Lee");
    expect(lawn?.rsvp_count).toBe(3);
    const hiddenHost = events.find((event) => event.beacon_id === "evt-2");
    expect(hiddenHost?.host_name).toBeNull();
  });
});

describe("loadPublicPastEvents", () => {
  it("returns ended public events sorted newest first", async () => {
    const pastStart = new Date(Date.now() - 86_400_000 * 10).toISOString();
    const olderStart = new Date(Date.now() - 86_400_000 * 20).toISOString();
    const futureStart = new Date(Date.now() + 86_400_000).toISOString();
    const admin = {
      from: (table: string) => {
        if (table === "map_beacons") {
          return thenableChain({
            data: [
              {
                id: "evt-past-1",
                beacon_type: "event",
                visibility_audience: "everyone",
                creator_id: "user-1",
                show_creator_name: true,
                location: null,
                ends_at: pastStart,
                metadata: { title: "Recent past", event_end_at: pastStart },
              },
              {
                id: "evt-past-2",
                beacon_type: "event",
                visibility_audience: "everyone",
                creator_id: "user-1",
                show_creator_name: true,
                location: null,
                ends_at: olderStart,
                metadata: { title: "Older past", event_end_at: olderStart },
              },
              {
                id: "evt-future",
                beacon_type: "event",
                visibility_audience: "everyone",
                creator_id: "user-1",
                show_creator_name: true,
                location: null,
                ends_at: futureStart,
                metadata: { title: "Still upcoming", event_end_at: futureStart },
              },
            ],
            error: null,
          });
        }
        if (table === "beacon_attendees" || table === "event_guest_rsvps") {
          return thenableChain({ data: [], error: null });
        }
        if (table === "users") {
          return thenableChain({
            data: [{ id: "user-1", name: "Jordan Lee", first_name: "Jordan", last_name: "Lee" }],
            error: null,
          });
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const events = await loadPublicPastEvents(admin as never);
    expect(events).toHaveLength(2);
    expect(events[0]?.beacon_id).toBe("evt-past-1");
    expect(events[1]?.beacon_id).toBe("evt-past-2");
  });
});

describe("loadPublicEventPayload", () => {
  it("includes created_at, timezone, and cover image keys", async () => {
    const start = new Date(Date.now() + 86_400_000).toISOString();
    const created = "2026-03-01T18:00:00.000Z";
    const admin = {
      from: (table: string) => {
        if (table === "map_beacons") {
          return thenableChain({
            data: {
              id: "evt-9",
              beacon_type: "event",
              created_at: created,
              show_creator_name: true,
              creator_id: "user-1",
              expires_at: null,
              location: { type: "Point", coordinates: [-122.305, 47.655] },
              metadata: {
                title: "Club fair",
                albumArtUrl: "https://cdn.example/cover.jpg",
                event_start_at: start,
                event_timezone: "America/Los_Angeles",
                location_name: "HUB Ballroom",
              },
            },
            error: null,
          });
        }
        if (table === "users") {
          return thenableChain({
            data: { name: "Jordan Lee", first_name: "Jordan", last_name: "Lee" },
            error: null,
          });
        }
        if (table === "beacon_attendees" || table === "event_guest_rsvps") {
          return thenableChain({ data: [], error: null });
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const event = await loadPublicEventPayload(admin as never, "evt-9");
    expect(event?.created_at).toBe(created);
    expect(event?.timezone).toBe("America/Los_Angeles");
    expect(event?.image_url).toBe("https://cdn.example/cover.jpg");
    expect(event?.latitude).toBeCloseTo(47.655);
    expect(event?.location_name).toBe("HUB Ballroom");
    expect(event?.creator_id).toBe("user-1");
    expect(event?.listing.event_visibility).toBe("public");
    expect(event?.visual_seed).toBe("evt-9");
  });

  it("falls back to metadata when starts_at column is invalid", async () => {
    const metaStart = new Date(Date.now() + 86_400_000).toISOString();
    const metaEnd = new Date(Date.now() + 90_000_000).toISOString();
    const admin = {
      from: (table: string) => {
        if (table === "map_beacons") {
          return thenableChain({
            data: {
              id: "evt-bad-col",
              beacon_type: "event",
              created_at: "2026-03-01T18:00:00.000Z",
              show_creator_name: false,
              creator_id: null,
              expires_at: null,
              location: null,
              starts_at: "not-a-real-timestamp",
              ends_at: "also-invalid",
              metadata: {
                title: "Fallback schedule",
                event_start_at: metaStart,
                event_end_at: metaEnd,
              },
            },
            error: null,
          });
        }
        if (table === "beacon_attendees" || table === "event_guest_rsvps") {
          return thenableChain({ data: [], error: null });
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const event = await loadPublicEventPayload(admin as never, "evt-bad-col");
    expect(event?.event_start_at).toBe(metaStart);
    expect(event?.event_end_at).toBe(metaEnd);
  });

  it("uses first-class starts_at when metadata is missing", async () => {
    const start = new Date(Date.now() + 86_400_000).toISOString();
    const admin = {
      from: (table: string) => {
        if (table === "map_beacons") {
          return thenableChain({
            data: [
              {
                id: "evt-col-only",
                beacon_type: "event",
                visibility_audience: "everyone",
                event_visibility: "public",
                creator_id: "user-1",
                show_creator_name: false,
                location: null,
                starts_at: start,
                ends_at: null,
                metadata: { title: "Column schedule" },
              },
            ],
            error: null,
          });
        }
        if (table === "beacon_attendees" || table === "event_guest_rsvps") {
          return thenableChain({ data: [], error: null });
        }
        if (table === "users") {
          return thenableChain({ data: [], error: null });
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const events = await loadPublicUpcomingEvents(admin as never);
    expect(events).toHaveLength(1);
    expect(events[0]?.event_start_at).toBe(start);
  });
});
