import {
  applyCancelOptimistic,
  applyRsvpOptimistic,
} from "@/lib/events/eventRsvpClient";

describe("event RSVP cache helpers", () => {
  it("appends the current user and increments the guest count", () => {
    const next = applyRsvpOptimistic(
      {
        current_user_signed_up: false,
        attendees: [{ user_id: "a", name: "Ada", avatar_url: null }],
        rsvp_count: 3,
      },
      { user_id: "b", name: "Bo", avatar_url: null },
    );
    expect(next.current_user_signed_up).toBe(true);
    expect(next.attendees).toHaveLength(2);
    expect(next.rsvp_count).toBe(4);
  });

  it("removes the current user and decrements the guest count", () => {
    const next = applyCancelOptimistic(
      {
        current_user_signed_up: true,
        attendees: [
          { user_id: "a", name: "Ada", avatar_url: null },
          { user_id: "b", name: "Bo", avatar_url: null },
        ],
        rsvp_count: 4,
      },
      "b",
    );
    expect(next.current_user_signed_up).toBe(false);
    expect(next.attendees).toEqual([{ user_id: "a", name: "Ada", avatar_url: null }]);
    expect(next.rsvp_count).toBe(3);
  });
});
