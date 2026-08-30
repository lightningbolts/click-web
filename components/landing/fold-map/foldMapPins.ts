import type { PresenceHeatmapCell } from '@/lib/landing/presenceHeatmap';

/** Fallback camera when the heatmap is empty (UW / greater Seattle). */
export const FOLD_MAP_CENTER: [number, number] = [-122.3321, 47.636];
export const FOLD_MAP_ZOOM = 11;
export const FOLD_MAP_MIN_ZOOM = 9;
export const FOLD_MAP_MAX_ZOOM = 18;
/** Cap so a nationwide outlier cannot pull the hero to a continent. */
export const FOLD_MAP_FIT_MAX_ZOOM = 12.4;

export const FOLD_MAP_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-122.44, 47.54],
  [-122.24, 47.72],
];

export type FoldMapLngLatBounds = [[number, number], [number, number]];

function atSorted(arr: number[], t: number) {
  const position = (arr.length - 1) * t;
  return arr[t < 0.5 ? Math.ceil(position) : Math.floor(position)];
}

/**
 * Heatmap framing for the first MapLibre camera. Call this before the map
 * is constructed so tiles never load at the closer fallback zoom.
 */
export function foldMapCameraBounds(
  cells: readonly PresenceHeatmapCell[],
): FoldMapLngLatBounds | null {
  if (cells.length === 0) return null;
  const lats = cells.map((cell) => cell.lat).sort((a, b) => a - b);
  const lngs = cells.map((cell) => cell.lng).sort((a, b) => a - b);
  if (cells.length < 8) {
    return [
      [lngs[0], lats[0]],
      [lngs[lngs.length - 1], lats[lats.length - 1]],
    ];
  }
  /** Keep one GPS outlier from yanking the hero to an empty coastline. */
  return [
    [atSorted(lngs, 0.06), atSorted(lats, 0.06)],
    [atSorted(lngs, 0.94), atSorted(lats, 0.94)],
  ];
}

/** Fit density into the map that is not covered by the offer plate. */
export function foldMapCameraPadding(width: number, height: number) {
  const plateW = Math.min(448 + 64, width * 0.92);
  const plateH = Math.min(390, height * 0.5);
  const left = Math.min(plateW, width * 0.42);
  const bottom = Math.min(plateH, height * 0.42);
  if (width < 720) {
    return { top: 72, right: 16, bottom, left: 16 };
  }
  return { top: 88, right: Math.min(80, width * 0.12), bottom, left };
}
