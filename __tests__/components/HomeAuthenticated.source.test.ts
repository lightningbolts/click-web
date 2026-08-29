import fs from "node:fs";
import path from "node:path";

describe("HomeAuthenticated boot loader", () => {
  it("keeps a single connections loader instead of stacking dynamic and Suspense fallbacks", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../components/HomeAuthenticated.tsx"),
      "utf8",
    );
    expect(src).toContain("boot-loader");
    expect(src).toContain("loading: () => null");
    expect(src).toContain("fallback={null}");
    expect(src.match(/<LoadingScreen/g)?.length).toBe(1);
  });
});
