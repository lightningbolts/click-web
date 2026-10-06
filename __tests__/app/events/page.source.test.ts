import fs from "node:fs";
import path from "node:path";

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, "../../..", rel), "utf8");
}

describe("/events directory (spec §7.6.1)", () => {
  it("renders server-side from tagged caches in the content column", () => {
    const list = read("app/events/page.tsx");
    expect(list).toContain("container-content");
    expect(list).toContain("tags: [PUBLIC_EVENTS_TAG]");
    expect(list).toContain("buildEventDirectory");
    expect(list).toContain("<Timeline");
    // The personal strip is a client island so the public list stays shared-cacheable.
    expect(list).toContain("<YourEventsStrip");
    expect(read("components/events/YourEventsStrip.tsx")).toMatch(/^'use client'/);
  });

  it("drops the cached lists whenever an event is created, edited or deleted", () => {
    expect(read("app/api/beacons/route.ts")).toContain('if (beacon_type === "event") revalidatePublicEvents()');
    const item = read("app/api/beacons/[beaconId]/route.ts");
    expect(item.match(/revalidatePublicEvents\(beaconId\)/g)?.length).toBe(2);
  });
});
