import fs from "node:fs";
import path from "node:path";

describe("brand share images", () => {
  it("builds favicons from the current logo-icon.svg, not a legacy ICO", () => {
    const script = fs.readFileSync(
      path.join(__dirname, "../../../scripts/generate-brand-icons.mjs"),
      "utf8",
    );
    expect(script).toContain("brand/logo-icon.svg");
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
    const icon = fs.readFileSync(path.join(__dirname, "../../../app/icon.tsx"), "utf8");
    expect(icon).toContain("BrandMarkOg");
  });
});
