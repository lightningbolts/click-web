import { countEventRsvpsByBeaconIds, loadPublicUpcomingEvents } from "@/lib/events/publicEvent";

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
