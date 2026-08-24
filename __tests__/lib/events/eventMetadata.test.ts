import {
  eventDisplayTitle,
  eventStartAtFromMetadata,
  normalizeGuestContact,
  rsvpEnabledFromMetadata,
} from "@/lib/events/eventMetadata";

describe("eventMetadata helpers", () => {
  it("normalizes email contact", () => {
    expect(normalizeGuestContact("Ada@Example.com")).toEqual({ contact: "ada@example.com" });
  });

  it("rejects empty contact", () => {
    expect(normalizeGuestContact("  ")).toEqual({ error: "Contact is required" });
  });

  it("defaults RSVP to enabled", () => {
    expect(rsvpEnabledFromMetadata({})).toBe(true);
    expect(rsvpEnabledFromMetadata({ rsvp_enabled: false })).toBe(false);
  });

  it("builds a display title from location or description when title is missing", () => {
    expect(eventDisplayTitle(null, "Cal Anderson Park", "Bring a blanket")).toBe("Cal Anderson Park");
    expect(eventDisplayTitle("", null, "Anyone welcome to study.")).toBe("Anyone welcome to study.");
    expect(eventDisplayTitle(null, null, null)).toBe("Event");
  });

  it("parses numeric event timestamps", () => {
    expect(eventStartAtFromMetadata({ event_start_at: 1_724_457_600_000 })).toBe("2024-08-24T00:00:00.000Z");
  });
});
