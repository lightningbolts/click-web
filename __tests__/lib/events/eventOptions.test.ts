import {
  coverVisualSeed,
  eventCategoriesFromMetadata,
  eventVisibilityToMapAudience,
  parseEventListingOptions,
  parseEventListingOptionsFromBody,
} from "@/lib/events/eventOptions";
import { decideMemberRsvp } from "@/lib/events/eventRsvpPolicy";

describe("event listing options", () => {
  it("maps listing visibility to map audience without extending the map enum", () => {
    expect(eventVisibilityToMapAudience("public")).toBe("everyone");
    expect(eventVisibilityToMapAudience("unlisted")).toBe("connections");
    expect(eventVisibilityToMapAudience("invite_only")).toBe("connections");
  });

  it("seeds cover visuals from the beacon id unless a theme override is set", () => {
    expect(coverVisualSeed("beacon-1", null)).toBe("beacon-1");
    expect(coverVisualSeed("beacon-1", "theme:teal")).toBe("theme:teal");
  });

  it("parses listing fields from body or metadata", () => {
    const parsed = parseEventListingOptionsFromBody({
      event_visibility: "unlisted",
      event_capacity: "40",
      approval_required: true,
      guest_list_visibility: "hosts_only",
      cover_theme_id: "theme:gold",
    });
    expect(parsed).toEqual({
      event_visibility: "unlisted",
      event_capacity: 40,
      approval_required: true,
      guest_list_visibility: "hosts_only",
      cover_theme_id: "theme:gold",
    });
    expect(parseEventListingOptions(null, { event_visibility: "invite_only" }).event_visibility).toBe(
      "invite_only",
    );
  });

  it("preserves safe custom event categories", () => {
    expect(
      eventCategoriesFromMetadata({
        event_categories: ["Music", "Board game night", "board game night", "x".repeat(41)],
      }),
    ).toEqual(["Music", "board game night"]);
  });
});

describe("decideMemberRsvp", () => {
  it("waitlists at capacity and requires approval before confirming", async () => {
    const admin = {
      from: (table: string) => ({
        select: () => ({
          eq: () =>
            Promise.resolve({
              count: table === "beacon_attendees" ? 2 : 0,
              data: [],
              error: null,
            }),
        }),
      }),
    };
    const waitlisted = await decideMemberRsvp({
      admin: admin as never,
      beaconId: "b",
      userId: "u",
      alreadyGoing: false,
      options: {
        event_visibility: "public",
        event_capacity: 2,
        approval_required: false,
        guest_list_visibility: "public",
        cover_theme_id: null,
      },
    });
    expect(waitlisted).toEqual({ kind: "waitlisted" });

    const pending = await decideMemberRsvp({
      admin: admin as never,
      beaconId: "b",
      userId: "u",
      alreadyGoing: false,
      options: {
        event_visibility: "public",
        event_capacity: 40,
        approval_required: true,
        guest_list_visibility: "public",
        cover_theme_id: null,
      },
    });
    expect(pending).toEqual({ kind: "pending" });
  });
});
