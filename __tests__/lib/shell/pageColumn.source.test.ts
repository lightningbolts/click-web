import fs from "node:fs";
import path from "node:path";

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, "../../../", rel), "utf8");
}

describe("shared page column", () => {
  it("keeps one max-w-6xl + px-4 md:px-10 token", () => {
    const column = read("lib/shell/pageColumn.ts");
    expect(column).toMatch(/PAGE_COLUMN_MAX_CLASS = ["']max-w-6xl["']/);
    expect(column).toContain("px-4 md:px-10");
    expect(column).toContain("PAGE_COLUMN_CLASS");
  });

  it("puts the Footer on PAGE_COLUMN_CLASS without extra bar padding", () => {
    const footer = read("components/Footer.tsx");
    expect(footer).toContain("PAGE_COLUMN_CLASS");
    expect(footer).not.toMatch(/px-6 py-12 text-on-surface md:px-12/);
  });

  it("keeps the map pane full-bleed", () => {
    // The map is a full-width app pane (spec §6.1), not a page column.
    const dashboard = read("components/map/MapScreen.tsx");
    expect(dashboard).not.toContain("PAGE_COLUMN_CLASS");
  });
});
