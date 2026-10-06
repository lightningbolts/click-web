import { weekHoursRows } from "@/lib/places/hours";

describe("weekHoursRows (spec §7.12 Hours)", () => {
  it("lists Monday to Sunday, marks today in the Place's zone and labels closed days", () => {
    // Wed 2026-10-07 02:00 UTC is still Tuesday in Los Angeles.
    const rows = weekHoursRows({ tue: [["09:00", "17:30"]], fri: [["18:00", "02:00"]] }, "America/Los_Angeles", Date.parse("2026-10-07T02:00:00Z"));
    expect(rows.map((r) => r.name)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    expect(rows.filter((r) => r.today).map((r) => r.day)).toEqual(["tue"]);
    expect(rows[1].label).toBe("9 AM – 5:30 PM");
    expect(rows[4].label).toBe("6 PM – 2 AM");
    expect(rows[0].label).toBe("Closed");
  });
});
