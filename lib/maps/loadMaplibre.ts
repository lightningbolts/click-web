let pending: Promise<typeof import("./maplibre")> | null = null;

/** Lazily loads maplibre-gl (worker URL configured). Safe to call repeatedly. */
export function loadMaplibre() {
  return (pending ??= import("./maplibre"));
}
