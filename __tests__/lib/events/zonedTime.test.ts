import { instantFromWallClock, timeZoneOptions, wallClockInZone, zoneAbbreviation } from "@/lib/events/zonedTime";

describe("zonedTime", () => {
  it("round-trips a wall clock in another zone", () => {
    const at = instantFromWallClock({ date: "2026-10-07", time: "18:00" }, "America/New_York");
    expect(at?.toISOString()).toBe("2026-10-07T22:00:00.000Z");
    expect(wallClockInZone(at!, "America/New_York")).toEqual({ date: "2026-10-07", time: "18:00" });
    expect(wallClockInZone(at!, "America/Los_Angeles")).toEqual({ date: "2026-10-07", time: "15:00" });
  });

  it("handles zones east of UTC and date rollover", () => {
    expect(instantFromWallClock({ date: "2026-01-01", time: "01:30" }, "Asia/Tokyo")?.toISOString()).toBe(
      "2025-12-31T16:30:00.000Z",
    );
  });

  it("moves a spring-forward gap time forward", () => {
    // 2026-03-08 02:30 does not exist in New York.
    const at = instantFromWallClock({ date: "2026-03-08", time: "02:30" }, "America/New_York");
    expect(wallClockInZone(at!, "America/New_York").time).toBe("03:30");
  });

  it("picks the earlier instant in a fall-back overlap", () => {
    const at = instantFromWallClock({ date: "2026-11-01", time: "01:30" }, "America/New_York");
    expect(at?.toISOString()).toBe("2026-11-01T05:30:00.000Z"); // EDT, not EST
  });

  it("rejects malformed input", () => {
    expect(instantFromWallClock({ date: "10/07/2026", time: "18:00" }, "UTC")).toBeNull();
  });

  it("names zones and lists options", () => {
    expect(zoneAbbreviation("America/Los_Angeles", new Date("2026-07-01T00:00:00Z"))).toBe("PDT");
    expect(timeZoneOptions("Etc/Custom")[0]).toBe("Etc/Custom");
  });
});
