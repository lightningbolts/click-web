import fs from "node:fs";
import path from "node:path";

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, "../../..", rel), "utf8");
}

describe("public event pages share EventPageShell", () => {
  it("locks list, create, and detail to the 6xl navbar column", () => {
    const list = read("app/events/page.tsx");
    const create = read("app/events/new/page.tsx");
    const detail = read("app/e/[beaconId]/page.tsx");
    for (const src of [list, create, detail]) {
      expect(src).toContain("EventPageShell");
    }
    expect(list).not.toContain("max-w-4xl");
    expect(create).not.toContain("max-w-2xl");
    expect(detail).not.toContain("max-w-5xl");
    const shell = read("components/events/EventPageShell.tsx");
    expect(shell).toContain("max-w-6xl");
    expect(shell).toContain("event-page-shell");
    expect(shell).toContain("px-4 md:px-10");
  });
});
