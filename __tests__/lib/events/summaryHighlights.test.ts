import { summaryHighlights } from "@/lib/events/summaryHighlights";

const base = { rsvp_count: 0, check_in_count: 0, connections_made: 0, new_pair_count: 0, density: 0 };

describe("summaryHighlights (spec §7.6.5, honest numbers)", () => {
  it("says nothing without data", () => {
    expect(summaryHighlights(base)).toEqual([]);
  });

  it("states turnout with n, capped at 100%", () => {
    expect(summaryHighlights({ ...base, rsvp_count: 4, check_in_count: 9 })[0]).toBe(
      "100% of people who RSVP’d checked in (n = 4).",
    );
  });

  it("describes Clicks made and the rate per check-in", () => {
    expect(summaryHighlights({ ...base, check_in_count: 10, connections_made: 6, new_pair_count: 4, density: 0.6 })).toEqual([
      "6 Clicks were made here, 4 between people meeting for the first time.",
      "About 0.6 new Clicks for every person who checked in.",
    ]);
  });
});
