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
});

describe("formatEventPostedAt", () => {
  it("prefixes Posted", () => {
    expect(formatEventPostedAt("2026-03-01T18:00:00.000Z")).toMatch(/^Posted /);
  });
});
