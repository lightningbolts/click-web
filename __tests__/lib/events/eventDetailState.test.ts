import {
  shouldShowEventFullCard,
  shouldShowEventRsvpPanel,
} from "@/lib/events/eventDetailState";

describe("event detail sidebar state", () => {
  it("shows RSVP closed instead of an active panel when RSVPs are disabled", () => {
    expect(shouldShowEventRsvpPanel({ rsvpEnabled: false, ended: false })).toBe(false);
  });

  it("keeps the ended-event status panel visible", () => {
    expect(shouldShowEventRsvpPanel({ rsvpEnabled: false, ended: true })).toBe(true);
  });

  it("does not duplicate the full card for a waitlisted viewer", () => {
    expect(
      shouldShowEventFullCard({
        atCapacity: true,
        going: false,
        requestStatus: "waitlisted",
        ended: false,
      }),
    ).toBe(false);
  });

  it("shows the full card for an unregistered viewer when capacity is reached", () => {
    expect(
      shouldShowEventFullCard({
        atCapacity: true,
        going: false,
        requestStatus: null,
        ended: false,
      }),
    ).toBe(true);
  });
});
