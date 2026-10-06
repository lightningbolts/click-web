import fs from "node:fs";
import path from "node:path";
import { placeRoleCanWrite, placeRoleFor, userMayManageBeacon } from "@/lib/events/beaconManageAuth";

function adminWithRole(role: string | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: role ? { role } : null, error: null }),
  };
  return { from: jest.fn(() => builder) } as never;
}

describe("beaconManageAuth (spec §9 roles)", () => {
  it("lets the creator manage without a Place lookup", async () => {
    const admin = adminWithRole(null);
    expect(await userMayManageBeacon(admin, "u1", { creator_id: "u1", venue_id: "p1" })).toBe(true);
  });

  it.each([
    ["owner", true],
    ["manager", true],
    ["viewer", false],
    [null, false],
  ])("Place role %s may manage: %s", async (role, ok) => {
    expect(await userMayManageBeacon(adminWithRole(role), "u2", { creator_id: "u1", venue_id: "p1" })).toBe(ok);
  });

  it("never grants manage rights on a Place-less event to non-creators", async () => {
    expect(await userMayManageBeacon(adminWithRole("owner"), "u2", { creator_id: "u1", venue_id: null })).toBe(false);
  });

  it("reads and gates roles", async () => {
    expect(await placeRoleFor(adminWithRole("viewer"), "u", "p")).toBe("viewer");
    expect(await placeRoleFor(adminWithRole("admin"), "u", "p")).toBeNull();
    expect(placeRoleCanWrite("viewer")).toBe(false);
    expect(placeRoleCanWrite("manager")).toBe(true);
  });

  it("enforces write roles when creating and editing Place events", () => {
    const read = (p: string) => fs.readFileSync(path.join(__dirname, "../../../", p), "utf8");
    const create = read("app/api/beacons/route.ts");
    expect(create).toContain("placeRoleCanWrite(role)");
    expect(create).toContain("Viewers can't create events for this Place");
    const item = read("app/api/beacons/[beaconId]/route.ts");
    expect(item).toContain("allowPlaceManagers: true");
  });
});
