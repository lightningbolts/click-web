import { formatEventPostedAt, formatEventWhen } from "@/lib/events/formatEventWhen";

describe("formatEventWhen", () => {
  it("includes a timezone abbreviation when an IANA zone is provided", () => {
    const label = formatEventWhen(
      "2026-04-10T02:00:00.000Z",
      "2026-04-10T04:00:00.000Z",
      "America/Los_Angeles",
    );
    expect(label).toMatch(/Apr/);
    expect(label).toMatch(/PDT|PST|GMT|UTC|Pacific/i);
  });

  it("falls back when the timezone is invalid", () => {
    const label = formatEventWhen("2026-04-10T19:00:00.000Z", null, "Not/A_Zone");
    expect(label).toMatch(/Apr/);
  });

  it("keeps time-only end labels for same-day ranges in the event timezone", () => {
    const label = formatEventWhen(
      "2026-04-10T20:00:00.000Z",
      "2026-04-11T04:00:00.000Z",
      "America/Los_Angeles",
    );
    expect(label).toMatch(/Apr 10/);
    expect(label).not.toMatch(/Apr 11/);
    expect(label).toMatch(/–\s*\d/);
  });

  it("includes weekday and date on the end when the range crosses calendar days in the event timezone", () => {
    const label = formatEventWhen(
      "2026-04-10T20:00:00.000Z",
      "2026-04-11T07:00:00.000Z",
      "America/Los_Angeles",
    );
    expect(label).toMatch(/Apr 10/);
    expect(label).toMatch(/Apr 11/);
  });
});

describe("formatEventPostedAt", () => {
  it("prefixes Posted", () => {
    expect(formatEventPostedAt("2026-03-01T18:00:00.000Z")).toMatch(/^Posted /);
  });
});
