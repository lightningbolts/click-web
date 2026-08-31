import fs from "node:fs";
import path from "node:path";

describe("brand share images", () => {
  it("builds favicons from the current logo-icon.svg, not a legacy ICO", () => {
    const script = fs.readFileSync(
      path.join(__dirname, "../../../scripts/generate-brand-icons.mjs"),
      "utf8",
    );
    expect(script).toContain("brand/logo-icon.svg");
    expect(script).toContain("opengraph-image.png");
    expect(script).not.toContain("decode-ico");
  });

  it("puts the current mark on root and event Open Graph tags", () => {
    const layout = fs.readFileSync(path.join(__dirname, "../../../app/layout.tsx"), "utf8");
    expect(layout).toContain("brandShareImage");
    expect(layout).toContain("openGraph");
    const event = fs.readFileSync(
      path.join(__dirname, "../../../app/e/[beaconId]/page.tsx"),
      "utf8",
    );
    expect(event).toContain("brandShareImage");
    expect(fs.existsSync(path.join(__dirname, "../../../app/opengraph-image.png"))).toBe(true);
  });

  it("does not import next/og, which pulls resvg.wasm into the Worker", () => {
    const root = path.join(__dirname, "../../..");
    const skip = new Set(["node_modules", ".next", ".open-next", "coverage", "dist"]);
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name) || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
          const source = fs.readFileSync(full, "utf8");
          if (/from\s+['"]next\/og['"]/.test(source)) {
            hits.push(path.relative(root, full));
          }
        }
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });
});
