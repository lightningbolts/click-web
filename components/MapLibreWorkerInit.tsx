'use client';

import { setWorkerUrl } from 'maplibre-gl';

setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

export default function MapLibreWorkerInit() {
  return null;
}
