/**
 * @jest-environment node
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "@/__tests__/helpers/fakeSupabase";
import { loadGuestRsvps, loadManageAttendees, loadManageCounts, loadRsvpRequests } from "@/lib/events/eventManageData";

const client = (db: FakeDb) => db.client as unknown as SupabaseClient;
const users = [
  { id: "ada", name: "Ada Lovelace", first_name: "Ada", last_name: "Lovelace", image: "https://img/ada.jpg" },
  { id: "sam", name: "Sam", first_name: null, last_name: null, image: null },
];

function world() {
  return new FakeDb({
    tables: {
      users,
      event_rsvp_requests: [
        { id: "r1", beacon_id: "b1", user_id: "sam", status: "waitlisted", created_at: "2026-10-02T00:00:00Z" },
        { id: "r2", beacon_id: "b1", user_id: "ada", status: "pending", created_at: "2026-10-01T00:00:00Z" },
        { id: "r3", beacon_id: "b1", user_id: "zed", status: "approved", created_at: "2026-10-01T00:00:00Z" },
        { id: "r4", beacon_id: "other", user_id: "ada", status: "pending", created_at: "2026-10-01T00:00:00Z" },
      ],
      beacon_attendees: [
        { beacon_id: "b1", user_id: "ada", rsvpd_at: null, created_at: "2026-10-01T00:00:00Z" },
        { beacon_id: "b1", user_id: "sam", rsvpd_at: "2026-10-03T00:00:00Z", created_at: "2026-10-03T00:00:00Z" },
      ],
      event_check_ins: [
        { beacon_id: "b1", user_id: "ada" },
        { beacon_id: "b1", user_id: "walk-in" },
        { beacon_id: "other", user_id: "sam" },
      ],
      event_guest_rsvps: [{ id: "g1", beacon_id: "b1", name: "Pat", contact: "pat@x.co", created_at: "2026-10-04T00:00:00Z" }],
    },
  });
}

describe("eventManageData (spec §7.6.4)", () => {
  it("loads pending and waitlisted requests, oldest first, with names", async () => {
    const rows = await loadRsvpRequests(client(world()), "b1");
    expect(rows).toEqual([
      { user_id: "ada", name: "Ada Lovelace", avatar_url: "https://img/ada.jpg", status: "pending", created_at: "2026-10-01T00:00:00Z" },
      { user_id: "sam", name: "Sam", avatar_url: null, status: "waitlisted", created_at: "2026-10-02T00:00:00Z" },
    ]);
  });

  it("falls back to a neutral name for missing profiles", async () => {
    const db = world();
    db.rows("event_rsvp_requests").push({ id: "r5", beacon_id: "b1", user_id: "ghost", status: "pending", created_at: "2026-10-05T00:00:00Z" });
    const rows = await loadRsvpRequests(client(db), "b1");
    expect(rows.at(-1)).toMatchObject({ user_id: "ghost", name: "Click member", avatar_url: null });
  });

  it("loads attendees newest first with check-in state", async () => {
    const rows = await loadManageAttendees(client(world()), "b1");
    expect(rows.map((r) => [r.user_id, r.checked_in, r.rsvpd_at])).toEqual([
      ["sam", false, "2026-10-03T00:00:00Z"],
      ["ada", true, "2026-10-01T00:00:00Z"],
    ]);
  });

  it("counts going (members + guests), requests, waitlist and check-ins for this event only", async () => {
    expect(await loadManageCounts(client(world()), "b1")).toEqual({
      going: 3,
      guests: 1,
      requests: 1,
      waitlist: 1,
      checkedIn: 2,
    });
  });

  it("hides guest contact details unless asked", async () => {
    const db = world();
    expect((await loadGuestRsvps(client(db), "b1", { showContact: true }))[0].contact).toBe("pat@x.co");
    expect((await loadGuestRsvps(client(db), "b1", { showContact: false }))[0]).toEqual({
      id: "g1",
      name: "Pat",
      contact: null,
      created_at: "2026-10-04T00:00:00Z",
    });
  });

  it("throws on read errors instead of showing empty data", async () => {
    const db = new FakeDb({ failTables: { event_check_ins: "boom" } });
    await expect(loadManageCounts(client(db), "b1")).rejects.toThrow("manage counts: boom");
  });
});
