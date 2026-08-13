/** Remote Carto styles for authenticated maps (ConnectionMap, insights). */
export const MAP_STYLE_LIGHT =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
export const MAP_STYLE_DARK =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/**
 * Carto Positron / Dark Matter style URLs.
 * Do not use on the landing playground — that map is client-only
 * (`playgroundMapStyle`) and must not fetch tiles or style APIs.
 */
export function mapStyleForTheme(theme: "light" | "dark") {
  return theme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
}

/** Brand primary used for pins / chart series */
export const FC_PRIMARY = "#630ed4";
