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

  it("puts Navbar, Insights chrome, and Footer on PAGE_COLUMN_CLASS without extra bar padding", () => {
    const navbar = read("components/Navbar.tsx");
    expect(navbar).toContain("PAGE_COLUMN_CLASS");
    expect(navbar).not.toMatch(/bg-surface px-4 py-3 text-on-surface md:px-10/);

    const insights = read("components/shell/ProductAppShell.tsx");
    expect(insights).toContain("PAGE_COLUMN_CLASS");
    expect(insights).not.toMatch(/bg-surface px-4 py-3 md:px-10/);
    expect(insights).toContain("flex-wrap");

    const footer = read("components/Footer.tsx");
    expect(footer).toContain("PAGE_COLUMN_CLASS");
    expect(footer).not.toMatch(/px-6 py-12 text-on-surface md:px-12/);
  });

  it("keeps chat and dashboard fill panes in the same column", () => {
    const dashboard = read("components/DashboardView.tsx");
    expect(dashboard).toContain("PAGE_COLUMN_CLASS");
    expect(dashboard).not.toMatch(/fillViewport \? 'flex flex-col overflow-hidden' : cn\(PAGE_COLUMN_CLASS/);

    const insightsBody = read("components/insights/BusinessInsightsShell.tsx");
    expect(insightsBody).not.toContain("max-w-[1800px]");
  });
});
