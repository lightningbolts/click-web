import fs from "node:fs";
import path from "node:path";

describe("event share page source", () => {
  it("embeds a client-only pin map with a stable test id", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../../app/e/[beaconId]/page.tsx"),
      "utf8",
    );
    expect(src).toContain("event-pin-map");
    expect(src).toContain("PinMapLazy");
  });
});
