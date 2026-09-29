import {
  MAX_EVENT_OCCURRENCES,
  expandEventOccurrences,
  parseEventRecurrenceFromBody,
  validateEventRecurrence,
} from "@/lib/events/eventRecurrence";

const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("parseEventRecurrenceFromBody", () => {
  it("treats a missing, null, or 'none' recurrence as a one-off event", () => {
    expect(parseEventRecurrenceFromBody({})).toEqual({ recurrence: null });
    expect(parseEventRecurrenceFromBody({ recurrence: null })).toEqual({ recurrence: null });
    expect(parseEventRecurrenceFromBody({ recurrence: { frequency: "none", count: 5 } })).toEqual({
      recurrence: null,
    });
  });

  it("accepts every supported frequency and a numeric-string count", () => {
    for (const frequency of ["daily", "weekly", "biweekly", "monthly"]) {
      expect(parseEventRecurrenceFromBody({ recurrence: { frequency, count: "4" } })).toEqual({
        recurrence: { frequency, count: 4 },
      });
    }
  });

  it("rejects unknown frequencies and out-of-range counts", () => {
    expect(parseEventRecurrenceFromBody({ recurrence: "weekly" })).toHaveProperty("error");
    expect(parseEventRecurrenceFromBody({ recurrence: { frequency: "yearly", count: 3 } })).toHaveProperty("error");
    expect(parseEventRecurrenceFromBody({ recurrence: { frequency: "weekly", count: 1 } })).toHaveProperty("error");
    expect(parseEventRecurrenceFromBody({ recurrence: { frequency: "weekly", count: 2.5 } })).toHaveProperty("error");
    expect(
      parseEventRecurrenceFromBody({ recurrence: { frequency: "weekly", count: MAX_EVENT_OCCURRENCES + 1 } }),
    ).toHaveProperty("error");
  });
});

describe("expandEventOccurrences", () => {
  it("returns the schedule unchanged without recurrence", () => {
    const schedule = { startEpochMs: Date.parse("2026-10-01T19:00:00Z"), endEpochMs: Date.parse("2026-10-01T21:00:00Z") };
    expect(expandEventOccurrences(schedule, null, "UTC")).toEqual([schedule]);
  });

  it("keeps the local start time across a DST change and preserves duration", () => {
    // Thursday 7pm PDT; clocks fall back on Sunday Nov 1 2026.
    const start = Date.parse("2026-10-29T19:00:00-07:00");
    const out = expandEventOccurrences(
      { startEpochMs: start, endEpochMs: start + 2 * HOUR },
      { frequency: "weekly", count: 3 },
      "America/Los_Angeles",
    );
    expect(out.map((o) => iso(o.startEpochMs))).toEqual([
      "2026-10-30T02:00:00.000Z",
      "2026-11-06T03:00:00.000Z", // 7pm PST
      "2026-11-13T03:00:00.000Z",
    ]);
    expect(out.every((o) => o.endEpochMs - o.startEpochMs === 2 * HOUR)).toBe(true);
  });

  it("steps daily and every two weeks", () => {
    const start = Date.parse("2026-12-30T10:00:00Z");
    const schedule = { startEpochMs: start, endEpochMs: start + HOUR };
    expect(expandEventOccurrences(schedule, { frequency: "daily", count: 3 }, "UTC").map((o) => iso(o.startEpochMs))).toEqual([
      "2026-12-30T10:00:00.000Z",
      "2026-12-31T10:00:00.000Z",
      "2027-01-01T10:00:00.000Z",
    ]);
    expect(expandEventOccurrences(schedule, { frequency: "biweekly", count: 2 }, "UTC").map((o) => iso(o.startEpochMs))).toEqual([
      "2026-12-30T10:00:00.000Z",
      "2027-01-13T10:00:00.000Z",
    ]);
  });

  it("clamps monthly occurrences to short months without drifting", () => {
    const start = Date.parse("2027-01-31T18:00:00Z");
    const out = expandEventOccurrences(
      { startEpochMs: start, endEpochMs: start + HOUR },
      { frequency: "monthly", count: 4 },
      "UTC",
    );
    expect(out.map((o) => iso(o.startEpochMs))).toEqual([
      "2027-01-31T18:00:00.000Z",
      "2027-02-28T18:00:00.000Z",
      "2027-03-31T18:00:00.000Z",
      "2027-04-30T18:00:00.000Z",
    ]);
  });

  it("uses the local calendar day, not the UTC one", () => {
    // 11pm in Tokyo is 14:00 UTC the same day; monthly must stay on the 31st local.
    const start = Date.parse("2027-01-31T23:00:00+09:00");
    const out = expandEventOccurrences(
      { startEpochMs: start, endEpochMs: start + HOUR },
      { frequency: "monthly", count: 2 },
      "Asia/Tokyo",
    );
    expect(iso(out[1].startEpochMs)).toBe("2027-02-28T14:00:00.000Z");
  });

  it("falls back to UTC for an unknown time zone", () => {
    const start = Date.parse("2026-10-01T19:00:00Z");
    const out = expandEventOccurrences(
      { startEpochMs: start, endEpochMs: start + HOUR },
      { frequency: "weekly", count: 2 },
      "Not/AZone",
    );
    expect(iso(out[1].startEpochMs)).toBe("2026-10-08T19:00:00.000Z");
  });
});

describe("validateEventRecurrence", () => {
  const start = Date.parse("2026-10-01T19:00:00Z");
  it("allows occurrences that end by the next start", () => {
    expect(validateEventRecurrence({ startEpochMs: start, endEpochMs: start + 24 * HOUR }, { frequency: "daily", count: 3 })).toBeNull();
    expect(validateEventRecurrence({ startEpochMs: start, endEpochMs: start + 3 * 24 * HOUR }, null)).toBeNull();
  });
  it("rejects overlapping occurrences", () => {
    expect(
      validateEventRecurrence({ startEpochMs: start, endEpochMs: start + 25 * HOUR }, { frequency: "daily", count: 3 }),
    ).not.toBeNull();
    expect(
      validateEventRecurrence({ startEpochMs: start, endEpochMs: start + 8 * 24 * HOUR }, { frequency: "weekly", count: 3 }),
    ).not.toBeNull();
  });
});
