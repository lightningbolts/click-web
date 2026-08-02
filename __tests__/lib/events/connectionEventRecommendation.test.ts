/**
 * @jest-environment node
 */

import {
  compareScoredRecommendations,
  isEventNotEnded,
  parseEventCategoryTags,
  pickTopRecommendation,
  scoreEventCandidate,
  type EventRecommendationCandidate,
} from "@/lib/events/connectionEventRecommendation";

function candidate(
  overrides: Partial<EventRecommendationCandidate> & Pick<EventRecommendationCandidate, "beacon_id">,
): EventRecommendationCandidate {
  return {
    title: "Event",
    event_start_at: "2026-08-10T18:00:00.000Z",
    event_end_at: "2026-08-10T21:00:00.000Z",
    location_name: null,
    lat: null,
    lng: null,
    category_tags: [],
    ...overrides,
  };
}

describe("parseEventCategoryTags", () => {
  it("reads event_categories and similar keys", () => {
    expect(parseEventCategoryTags({ event_categories: ["Hiking", "Coffee"] })).toEqual([
      "Hiking",
      "Coffee",
    ]);
    expect(parseEventCategoryTags({ categories: ["Music"] })).toEqual(["Music"]);
    expect(parseEventCategoryTags({ tags: [{ name: "Tech" }, "Art"] })).toEqual(["Tech", "Art"]);
  });
});

describe("isEventNotEnded", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");

  it("uses event_end_at when present", () => {
    expect(
      isEventNotEnded(
        {
          event_start_at: "2026-07-01T12:00:00.000Z",
          event_end_at: "2026-08-02T12:00:00.000Z",
        },
        now,
      ),
    ).toBe(true);
    expect(
      isEventNotEnded(
        {
          event_start_at: "2026-07-01T12:00:00.000Z",
          event_end_at: "2026-07-31T12:00:00.000Z",
        },
        now,
      ),
    ).toBe(false);
  });
});

describe("scoreEventCandidate", () => {
  it("scores interest overlap * 10", () => {
    const { score, shared_category_tags } = scoreEventCandidate(
      candidate({
        beacon_id: "b1",
        category_tags: ["Hiking", "Music"],
      }),
      ["hiking", "Coffee"],
      null,
      null,
    );
    expect(shared_category_tags).toEqual(["hiking"]);
    expect(score).toBe(10);
  });

  it("adds nearer distance bonus", () => {
    // ~0m → ~10 bonus; interest 0
    const near = scoreEventCandidate(
      candidate({ beacon_id: "near", lat: 47.6, lng: -122.3, category_tags: [] }),
      [],
      47.6,
      -122.3,
    );
    expect(near.score).toBeCloseTo(10, 0);

    // ~5km+ → ~0 bonus
    const far = scoreEventCandidate(
      candidate({ beacon_id: "far", lat: 47.65, lng: -122.3, category_tags: [] }),
      [],
      47.6,
      -122.3,
    );
    expect(far.score).toBeLessThan(near.score);
    expect(far.score).toBeGreaterThanOrEqual(0);
  });

  it("combines overlap and distance", () => {
    const { score } = scoreEventCandidate(
      candidate({
        beacon_id: "b2",
        lat: 47.6,
        lng: -122.3,
        category_tags: ["Coffee", "Art"],
      }),
      ["Coffee"],
      47.6,
      -122.3,
    );
    expect(score).toBeGreaterThan(10);
    expect(score).toBeLessThanOrEqual(20);
  });
});

describe("pickTopRecommendation", () => {
  it("returns null for empty candidates", () => {
    expect(pickTopRecommendation([], ["a"], "peer", "Peer")).toBeNull();
  });

  it("picks higher score, then sooner start", () => {
    const top = pickTopRecommendation(
      [
        candidate({
          beacon_id: "later-high",
          title: "Later",
          event_start_at: "2026-08-20T18:00:00.000Z",
          category_tags: ["Hiking"],
        }),
        candidate({
          beacon_id: "sooner-high",
          title: "Sooner",
          event_start_at: "2026-08-05T18:00:00.000Z",
          category_tags: ["Hiking"],
        }),
        candidate({
          beacon_id: "low",
          title: "Low",
          event_start_at: "2026-08-03T18:00:00.000Z",
          category_tags: [],
        }),
      ],
      ["Hiking"],
      "peer-1",
      "Peer One",
    );

    expect(top?.beacon_id).toBe("sooner-high");
    expect(top?.peer_name).toBe("Peer One");
    expect(top?.score).toBe(10);
    expect(top?.shared_category_tags).toEqual(["Hiking"]);
  });
});

describe("compareScoredRecommendations", () => {
  it("tie-breaks by earlier start", () => {
    const cmp = compareScoredRecommendations(
      {
        score: 10,
        event_start_at: "2026-08-10T00:00:00.000Z",
        beacon_id: "a",
      },
      {
        score: 10,
        event_start_at: "2026-08-09T00:00:00.000Z",
        beacon_id: "b",
      },
    );
    expect(cmp).toBeGreaterThan(0);
  });
});
