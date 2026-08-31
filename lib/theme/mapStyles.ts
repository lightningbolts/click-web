/** Carto styles fetched by the browser from cartocdn.com (not the Cloudflare Worker). */
export const MAP_STYLE_LIGHT =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
export const MAP_STYLE_DARK =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/**
 * Carto Positron / Dark Matter style URLs.
 * Landing playground uses these in the client with maxBounds + transformRequest
 * so tiles never hit `/api/*` or the Worker. Do not proxy this URL through Next.
 */
export function mapStyleForTheme(theme: "light" | "dark") {
  return theme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
}

/** Brand primary used for pins / chart series */
export const FC_PRIMARY = "#7c3aed";
/** Event / alternate map pin emphasis (purple family) */
export const FC_SECONDARY = "#6d28d9";
