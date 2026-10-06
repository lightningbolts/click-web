/**
 * The only module that may import `maplibre-gl` at runtime. Importing it sets the
 * worker URL as a side effect, so the ~800 KB library is fetched only by routes
 * that render a map (spec §11) instead of from the root layout.
 */
import { setWorkerUrl } from "maplibre-gl";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export * from "maplibre-gl";
