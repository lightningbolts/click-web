import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(__dirname, "../../../", p), "utf8");

describe("event page source (spec §7.6.2)", () => {
  const page = read("app/e/[beaconId]/page.tsx");
  const src = read("components/events/EventPageView.tsx");

  it("uses the tagged public-event cache for both metadata and the page", () => {
    expect(page).toContain("loadPublicEvent");
    expect(page).not.toContain("public-event-v1");
    expect(page).toContain("brandShareImage");
    expect(page).toContain("<EventPageView");
  });

  it("lays out a sticky cover column beside the article", () => {
    expect(src).toContain("min-[900px]:grid-cols-[340px_minmax(0,1fr)]");
    expect(src).toContain("min-[900px]:sticky");
    expect(src).toContain("event-tint");
  });

  it("streams viewer-specific islands behind Suspense", () => {
    expect(src).toContain("<HostBar");
    expect(src).toContain("<RsvpIsland");
    expect(src).toContain("<ChatIsland");
    expect(src).toContain("loadEventViewer");
  });

  it("drops the legacy shells", () => {
    expect(src).not.toContain("EventPageShell");
    expect(src).not.toContain("FcCard");
    expect(src).not.toContain("EventRsvpPanel");
  });

  it("only links the app when it has launched", () => {
    expect(src).toContain("APP_CONFIG.app_launched");
  });

  it("serves an .ics download", () => {
    const ics = read("app/e/[beaconId]/calendar.ics/route.ts");
    expect(ics).toContain("text/calendar");
  });
});
