import { dropSameOriginMapRequest } from "@/lib/map/dropSameOriginMapRequest";

describe("dropSameOriginMapRequest", () => {
  it("blanks same-origin URLs so MapLibre cannot proxy through the Worker", () => {
    const origin = window.location.origin;
    expect(dropSameOriginMapRequest(`${origin}/api/map/style`)).toEqual({
      url: "about:blank",
    });
  });

  it("keeps Carto CDN URLs", () => {
    const carto = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
    expect(dropSameOriginMapRequest(carto)).toEqual({ url: carto });
  });
});
