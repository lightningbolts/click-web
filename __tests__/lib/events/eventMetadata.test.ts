import {
  eventDisplayTitle,
  eventInstantFromRowOrMeta,
  eventStartAtFromMetadata,
  eventSubtitle,
  eventTimezoneFromMetadata,
  eventWhereLabel,
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

  it("reads IANA timezone from metadata aliases", () => {
    expect(eventTimezoneFromMetadata({ event_timezone: "America/Los_Angeles" })).toBe(
      "America/Los_Angeles",
    );
    expect(eventTimezoneFromMetadata({ eventTimezone: "America/New_York" })).toBe("America/New_York");
    expect(eventTimezoneFromMetadata({})).toBeNull();
  });

  it("hides a description that only echoes the title", () => {
    expect(eventSubtitle("Picnic", "Picnic")).toBeNull();
    expect(eventSubtitle("Picnic", "Bring a blanket.")).toBe("Bring a blanket.");
    expect(eventSubtitle("Picnic", "  ")).toBeNull();
  });

  it("omits empty locations instead of placeholder copy", () => {
    expect(eventWhereLabel("Cal Anderson Park")).toBe("Cal Anderson Park");
    expect(eventWhereLabel("  ")).toBeNull();
    expect(eventWhereLabel(null)).toBeNull();
  });

  it("maps legacy Current location labels for viewers", () => {
    expect(eventWhereLabel("Current location")).toBe("Location shared privately");
    expect(eventWhereLabel("CURRENT LOCATION")).toBe("Location shared privately");
    expect(eventWhereLabel(" current location ")).toBe("Location shared privately");
  });

  it("prefers valid row timestamps and falls back to metadata", () => {
    const metaStart = "2026-08-24T18:00:00.000Z";
    expect(eventInstantFromRowOrMeta("not-a-date", metaStart)).toBe(metaStart);
    expect(eventInstantFromRowOrMeta(null, metaStart)).toBe(metaStart);
    expect(eventInstantFromRowOrMeta("2026-09-01T12:00:00.000Z", metaStart)).toBe(
      "2026-09-01T12:00:00.000Z",
    );
    expect(eventInstantFromRowOrMeta(1_724_457_600_000, null)).toBe("2024-08-24T00:00:00.000Z");
  });
});
