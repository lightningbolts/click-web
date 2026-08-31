import fs from "node:fs";
import path from "node:path";

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, "../../..", rel), "utf8");
}

describe("public event pages share EventPageShell", () => {
  it("locks list, create, and detail to the 6xl navbar column", () => {
    const list = read("app/events/page.tsx");
    const listBody = read("components/events/EventsPageBody.tsx");
    const create = read("app/events/new/page.tsx");
    const detail = read("app/e/[beaconId]/page.tsx");
    expect(list).toContain("EventsPageBody");
    for (const src of [listBody, create, detail]) {
      expect(src).toContain("EventPageShell");
    }
    expect(list).not.toContain("max-w-4xl");
    expect(create).not.toContain("max-w-2xl");
    expect(detail).not.toContain("max-w-5xl");
    const shell = read("components/events/EventPageShell.tsx");
    expect(shell).toContain("PAGE_COLUMN_CLASS");
    expect(shell).toContain("event-page-shell");
    expect(shell).toContain("EventPageEnter");
    const column = read("lib/shell/pageColumn.ts");
    expect(column).toContain("max-w-6xl");
    expect(column).toContain("px-4 md:px-10");
  });
});
