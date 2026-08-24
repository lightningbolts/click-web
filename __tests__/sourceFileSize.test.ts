import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");
const SKIP = new Set(["node_modules", ".next", ".open-next", "coverage", "dist"]);
const MAX_LINES = 1000;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe("source file size", () => {
  it("keeps application TypeScript files at or under 1000 lines", () => {
    const files = walk(ROOT);
    const oversized = files
      .map((file) => {
        const lines = fs.readFileSync(file, "utf8").split("\n").length;
        return { file: path.relative(ROOT, file), lines };
      })
      .filter((row) => row.lines > MAX_LINES);
    expect(oversized).toEqual([]);
  });
});
