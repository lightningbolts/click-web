import type { StyleSpecification } from 'maplibre-gl';

/** Inline paint tokens for the landing playground basemap (no remote tiles). */
export const PLAYGROUND_MAP_PAINT = {
  light: {
    background: '#d7e3ee',
    water: '#8fb6d4',
    park: '#c5d9b0',
    campus: '#efe6d6',
    road: '#ffffff',
    roadCase: '#c9c0b2',
  },
  dark: {
    background: '#16121f',
    water: '#1a3354',
    park: '#1d3328',
    campus: '#2a2138',
    road: '#3f3850',
    roadCase: '#241c32',
  },
} as const;

type PlaygroundTheme = keyof typeof PLAYGROUND_MAP_PAINT;

type PaintLayer = {
  id: string;
  property: string;
  token: keyof (typeof PLAYGROUND_MAP_PAINT)['light'];
};

const PAINT_LAYERS: PaintLayer[] = [
  { id: 'background', property: 'background-color', token: 'background' },
  { id: 'water', property: 'fill-color', token: 'water' },
  { id: 'park', property: 'fill-color', token: 'park' },
  { id: 'campus', property: 'fill-color', token: 'campus' },
  { id: 'road-case', property: 'line-color', token: 'roadCase' },
  { id: 'road', property: 'line-color', token: 'road' },
];

/**
 * Simplified Seattle / UW schematic covering playground pin coordinates.
 * Coordinates are [lng, lat]. Rings are closed.
 */
const PLAYGROUND_BASEMAP: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { kind: 'water' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-122.38, 47.575],
          [-122.345, 47.575],
          [-122.338, 47.605],
          [-122.352, 47.632],
          [-122.38, 47.62],
          [-122.38, 47.575],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'water' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-122.345, 47.628],
          [-122.322, 47.628],
          [-122.322, 47.649],
          [-122.345, 47.649],
          [-122.345, 47.628],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'water' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-122.3, 47.647],
          [-122.282, 47.647],
          [-122.275, 47.658],
          [-122.292, 47.664],
          [-122.305, 47.657],
          [-122.3, 47.647],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'water' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-122.262, 47.64],
          [-122.228, 47.64],
          [-122.228, 47.7],
          [-122.262, 47.7],
          [-122.262, 47.64],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'campus' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-122.316, 47.651],
          [-122.298, 47.651],
          [-122.296, 47.66],
          [-122.314, 47.66],
          [-122.316, 47.651],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'park' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-122.3115, 47.6544],
          [-122.3072, 47.6544],
          [-122.3072, 47.6566],
          [-122.3115, 47.6566],
          [-122.3115, 47.6544],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'road' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-122.332, 47.61],
          [-122.32, 47.64],
          [-122.312, 47.655],
          [-122.304, 47.662],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'road' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-122.342, 47.61],
          [-122.32, 47.628],
          [-122.308, 47.655],
          [-122.3, 47.656],
        ],
      },
    },
  ],
};

export function playgroundMapStyle(theme: PlaygroundTheme): StyleSpecification {
  const paint = PLAYGROUND_MAP_PAINT[theme];
  return {
    version: 8,
    name: 'click-playground-local',
    sources: {
      basemap: {
        type: 'geojson',
        data: PLAYGROUND_BASEMAP,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': paint.background },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'basemap',
        filter: ['==', ['get', 'kind'], 'water'],
        paint: { 'fill-color': paint.water },
      },
      {
        id: 'campus',
        type: 'fill',
        source: 'basemap',
        filter: ['==', ['get', 'kind'], 'campus'],
        paint: { 'fill-color': paint.campus },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'basemap',
        filter: ['==', ['get', 'kind'], 'park'],
        paint: { 'fill-color': paint.park },
      },
      {
        id: 'road-case',
        type: 'line',
        source: 'basemap',
        filter: ['==', ['get', 'kind'], 'road'],
        paint: {
          'line-color': paint.roadCase,
          'line-width': 4,
        },
      },
      {
        id: 'road',
        type: 'line',
        source: 'basemap',
        filter: ['==', ['get', 'kind'], 'road'],
        paint: {
          'line-color': paint.road,
          'line-width': 2,
        },
      },
    ],
  };
}

type ThemeableMap = {
  getLayer: (id: string) => unknown;
  setPaintProperty: (layerId: string, name: string, value: unknown) => void;
};

/** Retint the existing local style in place — do not call setStyle or remount. */
export function applyPlaygroundMapTheme(map: ThemeableMap, theme: PlaygroundTheme) {
  const paint = PLAYGROUND_MAP_PAINT[theme];
  for (const layer of PAINT_LAYERS) {
    if (!map.getLayer(layer.id)) continue;
    map.setPaintProperty(layer.id, layer.property, paint[layer.token]);
  }
}

/** True when a MapLibre style object has no http(s) urls (tiles, glyphs, sprites, style endpoints). */
export function styleHasRemoteUrls(style: StyleSpecification): boolean {
  return collectStrings(style).some((value) => /^https?:\/\//i.test(value));
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStrings(entry, out));
    return out;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => collectStrings(entry, out));
  }
  return out;
}
