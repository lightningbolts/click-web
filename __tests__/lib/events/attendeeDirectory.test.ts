/**
 * @jest-environment node
 */

import {
  buildDirectoryAttendees,
  buildMutualViaMap,
  classifyRelationship,
  isActiveIshConnection,
  peerIdsFromConnections,
  sortAlphabetically,
  sortByInterestOverlap,
  sortByMutualConnections,
  sortByRsvpDistance,
  type AttendeeRow,
  type ConnectionRow,
  type DirectoryAttendee,
  type UserProfileRow,
} from "@/lib/events/attendeeDirectory";

const V = "viewer-uuid";
const A = "alice-uuid";
const B = "bob-uuid";
const C = "carol-uuid";
const D = "dave-uuid";

function profile(id: string, name: string): UserProfileRow {
  return {
    id,
    name,
    image: null,
    first_name: name,
    last_name: null,
  };
}

function attendee(
  overrides: Partial<DirectoryAttendee> & Pick<DirectoryAttendee, "user_id" | "name">,
): DirectoryAttendee {
  return {
    avatar_url: null,
    signed_up_at: "2026-08-01T12:00:00.000Z",
    distance_meters: null,
    shared_interests: [],
    shared_interest_count: 0,
    relationship: "stranger",
    mutual_via: [],
    mutual_connection_count: 0,
    ...overrides,
  };
}

describe("classifyRelationship", () => {
  it("labels self, connection, mutual, stranger", () => {
    const direct = new Set([A, B]);
    expect(classifyRelationship(V, V, direct, [])).toBe("self");
    expect(classifyRelationship(A, V, direct, [])).toBe("connection");
    expect(
      classifyRelationship(C, V, direct, [{ user_id: A, name: "Alice" }]),
    ).toBe("mutual");
    expect(classifyRelationship(D, V, direct, [])).toBe("stranger");
  });

  it("prefers connection over mutual_via noise", () => {
    expect(
      classifyRelationship(A, V, new Set([A]), [{ user_id: B, name: "Bob" }]),
    ).toBe("connection");
  });
});

describe("isActiveIshConnection", () => {
  it("accepts active/kept status", () => {
    expect(isActiveIshConnection({ status: "active", expiry_state: null })).toBe(true);
    expect(isActiveIshConnection({ status: "kept", expiry_state: "removed" })).toBe(true);
  });

  it("rejects removed/archived status and removed expiry", () => {
    expect(isActiveIshConnection({ status: "removed", expiry_state: "active" })).toBe(false);
    expect(isActiveIshConnection({ status: "archived", expiry_state: null })).toBe(false);
    expect(isActiveIshConnection({ status: "pending", expiry_state: "removed" })).toBe(false);
  });

  it("accepts pending / null when expiry is not removed", () => {
    expect(isActiveIshConnection({ status: "pending", expiry_state: "pending" })).toBe(true);
    expect(isActiveIshConnection({ status: null, expiry_state: null })).toBe(true);
  });
});

describe("peerIdsFromConnections + buildMutualViaMap", () => {
  const connections: ConnectionRow[] = [
    { id: "c1", user_ids: [V, A], status: "active", expiry_state: "active" },
    { id: "c2", user_ids: [V, B], status: "kept", expiry_state: "kept" },
    { id: "c3", user_ids: [V, D], status: "removed", expiry_state: "removed" },
  ];

  it("collects direct peers from active-ish connections only", () => {
    const peers = peerIdsFromConnections(connections, V);
    expect(peers.has(A)).toBe(true);
    expect(peers.has(B)).toBe(true);
    expect(peers.has(D)).toBe(false);
  });

  it("builds mutual_via from FoF edges into C", () => {
    const direct = peerIdsFromConnections(connections, V);
    const fof: ConnectionRow[] = [
      { id: "f1", user_ids: [A, C], status: "active", expiry_state: "active" },
      { id: "f2", user_ids: [B, C], status: "active", expiry_state: "active" },
      { id: "f3", user_ids: [A, D], status: "active", expiry_state: "active" },
    ];
    const names = new Map([
      [A, "Alice"],
      [B, "Bob"],
    ]);
    const via = buildMutualViaMap(V, direct, fof, names);
    expect(via.get(C)?.map((x) => x.user_id).sort()).toEqual([A, B].sort());
    expect(via.get(D)?.map((x) => x.user_id)).toEqual([A]);
    expect(via.has(A)).toBe(false);
  });
});

describe("buildDirectoryAttendees", () => {
  it("wires shared interests and relationships", () => {
    const attendeeRows: AttendeeRow[] = [
      { user_id: V, signed_up_at: "2026-08-01T10:00:00.000Z", distance_meters: 10 },
      { user_id: A, signed_up_at: "2026-08-01T11:00:00.000Z", distance_meters: 100 },
      { user_id: C, signed_up_at: "2026-08-01T12:00:00.000Z", distance_meters: null },
      { user_id: D, signed_up_at: "2026-08-01T13:00:00.000Z", distance_meters: 50 },
    ];
    const profiles = new Map([
      [V, profile(V, "Viewer")],
      [A, profile(A, "Alice")],
      [C, profile(C, "Carol")],
      [D, profile(D, "Dave")],
    ]);
    const interestsByUser = new Map([
      [V, ["Hiking", "Coffee"]],
      [A, ["hiking", "Music"]],
      [C, ["Coffee"]],
      [D, ["Chess"]],
    ]);
    const directPeers = new Set([A]);
    const mutualViaByAttendee = new Map([
      [C, [{ user_id: A, name: "Alice" }]],
    ]);

    const rows = buildDirectoryAttendees({
      viewerId: V,
      attendeeRows,
      profiles,
      interestsByUser,
      directPeers,
      mutualViaByAttendee,
    });

    expect(rows.find((r) => r.user_id === V)?.relationship).toBe("self");
    expect(rows.find((r) => r.user_id === A)?.relationship).toBe("connection");
    expect(rows.find((r) => r.user_id === A)?.shared_interests).toEqual(["Hiking"]);
    expect(rows.find((r) => r.user_id === C)?.relationship).toBe("mutual");
    expect(rows.find((r) => r.user_id === C)?.mutual_connection_count).toBe(1);
    expect(rows.find((r) => r.user_id === D)?.relationship).toBe("stranger");
  });
});

describe("directory sorts", () => {
  const fixture: DirectoryAttendee[] = [
    attendee({
      user_id: "z",
      name: "Zoe",
      shared_interest_count: 1,
      distance_meters: 200,
      mutual_connection_count: 0,
    }),
    attendee({
      user_id: "a",
      name: "Amy",
      shared_interest_count: 3,
      distance_meters: null,
      mutual_connection_count: 2,
    }),
    attendee({
      user_id: "b",
      name: "Ben",
      shared_interest_count: 3,
      distance_meters: 50,
      mutual_connection_count: 1,
    }),
  ];

  it("sortAlphabetically", () => {
    expect(sortAlphabetically(fixture).map((r) => r.name)).toEqual(["Amy", "Ben", "Zoe"]);
  });

  it("sortByInterestOverlap then name", () => {
    expect(sortByInterestOverlap(fixture).map((r) => r.name)).toEqual(["Amy", "Ben", "Zoe"]);
  });

  it("sortByRsvpDistance with nulls last", () => {
    expect(sortByRsvpDistance(fixture).map((r) => r.name)).toEqual(["Ben", "Zoe", "Amy"]);
  });

  it("sortByMutualConnections", () => {
    expect(sortByMutualConnections(fixture).map((r) => r.name)).toEqual(["Amy", "Ben", "Zoe"]);
  });
});
