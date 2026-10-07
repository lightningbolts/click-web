import * as maplibregl from '@/lib/maps/maplibre';
import { avatarFallbackColor, avatarInitials } from '@/lib/ui/avatarFallback';
import { cardVisualStyleCss } from '@/lib/ui/cardVisualPattern';
import { generateCardVisual } from '@/lib/ui/generateCardVisual';

/**
 * Map pins as DOM markers (spec §7.5): people are avatars, events and Places are thumbnails,
 * clusters are action capsules. MapLibre still does the clustering on the GPU side; only the
 * clusters and points in loaded tiles become elements, and elements are reused between syncs.
 */
export type PinModel =
  | { kind: 'cluster'; key: string; lng: number; lat: number; count: number; source: string; clusterId: number; label: string }
  | { kind: 'person'; key: string; lng: number; lat: number; seed: string; name: string; avatarUrl: string | null; count: number; connIds: string[] }
  | { kind: 'event'; key: string; lng: number; lat: number; id: string; title: string; imageUrl: string | null; live: boolean }
  | { kind: 'place'; key: string; lng: number; lat: number; id: string; title: string; imageUrl: string | null; live: boolean }
  | { kind: 'beacon'; key: string; lng: number; lat: number; id: string; title: string; tint: string; icon: string; imageUrl: string | null };

/** Hard cap on live DOM markers; clustering keeps real views far below it. */
export const MAX_DOM_PINS = 250;

/** Only http(s) images ever reach an <img src>. */
export function safeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function pinLabel(model: PinModel): string {
  switch (model.kind) {
    case 'cluster':
      return model.label;
    case 'person':
      return model.count > 1 ? `${model.name} and ${model.count - 1} more` : model.name;
    case 'event':
      return model.live ? `${model.title}, live now` : model.title;
    case 'place':
      return model.live ? `${model.title}, live now` : model.title;
    default:
      return model.title;
  }
}

/** Everything that changes how a pin looks; equal signatures skip the DOM update. */
export function pinSignature(model: PinModel): string {
  switch (model.kind) {
    case 'cluster':
      return `c|${model.count}`;
    case 'person':
      return `p|${model.name}|${model.avatarUrl ?? ''}|${model.count}`;
    case 'event':
    case 'place':
      return `${model.kind}|${model.title}|${model.imageUrl ?? ''}|${model.live}`;
    default:
      return `b|${model.title}|${model.tint}|${model.icon}|${model.imageUrl ?? ''}`;
  }
}

function img(src: string, className: string): HTMLImageElement {
  const el = document.createElement('img');
  el.src = src;
  el.alt = '';
  el.decoding = 'async';
  el.loading = 'lazy';
  el.className = className;
  return el;
}

function thumb(seed: string, imageUrl: string | null, className: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  el.setAttribute('style', cardVisualStyleCss(generateCardVisual(seed)));
  const src = safeImageUrl(imageUrl);
  if (src) el.appendChild(img(src, 'map-pin-img'));
  return el;
}

function livePill(): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'map-pin-live';
  el.textContent = 'LIVE';
  return el;
}

/** Fills a pin element for a model (used on create and when the signature changes). */
export function renderPin(el: HTMLElement, model: PinModel): void {
  el.replaceChildren();
  el.className = `map-pin map-pin-${model.kind}`;
  el.setAttribute('aria-label', pinLabel(model));
  switch (model.kind) {
    case 'cluster': {
      el.textContent = model.count > 999 ? '999+' : String(model.count);
      break;
    }
    case 'person': {
      const src = safeImageUrl(model.avatarUrl);
      const face = document.createElement('span');
      face.className = 'map-pin-face';
      if (src) face.appendChild(img(src, 'map-pin-img'));
      else {
        face.style.background = avatarFallbackColor(model.seed);
        face.textContent = avatarInitials(model.name);
      }
      el.appendChild(face);
      if (model.count > 1) {
        const badge = document.createElement('span');
        badge.className = 'map-pin-count';
        badge.textContent = String(model.count);
        el.appendChild(badge);
      }
      break;
    }
    case 'event': {
      if (model.live) el.appendChild(livePill());
      el.appendChild(thumb(model.id, model.imageUrl, 'map-pin-thumb'));
      break;
    }
    case 'place': {
      if (model.live) el.appendChild(livePill());
      el.appendChild(thumb(model.id, model.imageUrl, 'map-pin-thumb'));
      break;
    }
    case 'beacon': {
      // A beacon with a picture (a soundtrack's artwork, a photo) shows it, like an event.
      if (safeImageUrl(model.imageUrl)) {
        el.appendChild(thumb(model.id, model.imageUrl, 'map-pin-thumb'));
        break;
      }
      const tile = document.createElement('span');
      tile.className = 'map-pin-tile';
      tile.style.background = model.tint;
      tile.textContent = model.icon;
      el.appendChild(tile);
      break;
    }
  }
}

type Entry = { marker: maplibregl.Marker; el: HTMLButtonElement; sig: string; model: PinModel };

/**
 * Owns the DOM markers on one map. `sync` diffs by key: new pins are created, changed pins
 * re-render, gone pins are removed. Clicks never reach the map (so they don't clear selection).
 */
export class MapMarkerLayer {
  private entries = new Map<string, Entry>();
  private selectedKey: string | null = null;

  constructor(
    private map: maplibregl.Map,
    private handlers: {
      onSelect: (model: PinModel) => void;
      onHover?: (model: PinModel | null, point: { x: number; y: number } | null) => void;
    },
  ) {}

  sync(models: PinModel[]): void {
    const next = new Map(models.slice(0, MAX_DOM_PINS).map((m) => [m.key, m]));
    for (const [key, entry] of this.entries) {
      if (!next.has(key)) {
        entry.marker.remove();
        this.entries.delete(key);
      }
    }
    for (const [key, model] of next) {
      const sig = pinSignature(model);
      const existing = this.entries.get(key);
      if (existing) {
        existing.model = model;
        existing.marker.setLngLat([model.lng, model.lat]);
        if (existing.sig !== sig) {
          renderPin(existing.el, model);
          existing.sig = sig;
          existing.el.toggleAttribute('data-selected', key === this.selectedKey);
        }
        continue;
      }
      const el = document.createElement('button');
      el.type = 'button';
      renderPin(el, model);
      el.toggleAttribute('data-selected', key === this.selectedKey);
      const entry: Entry = { marker: new maplibregl.Marker({ element: el, anchor: 'center' }), el, sig, model };
      const stop = (e: Event) => e.stopPropagation();
      el.addEventListener('mousedown', stop);
      el.addEventListener('touchstart', stop, { passive: true });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handlers.onSelect(entry.model);
      });
      el.addEventListener('mouseenter', () => {
        const p = this.map.project([entry.model.lng, entry.model.lat]);
        this.handlers.onHover?.(entry.model, { x: p.x, y: p.y });
      });
      el.addEventListener('mouseleave', () => this.handlers.onHover?.(null, null));
      entry.marker.setLngLat([model.lng, model.lat]).addTo(this.map);
      this.entries.set(key, entry);
    }
  }

  setSelected(key: string | null): void {
    if (key === this.selectedKey) return;
    this.entries.get(this.selectedKey ?? '')?.el.removeAttribute('data-selected');
    this.selectedKey = key;
    this.entries.get(key ?? '')?.el.setAttribute('data-selected', '');
  }

  size(): number {
    return this.entries.size;
  }

  destroy(): void {
    for (const entry of this.entries.values()) entry.marker.remove();
    this.entries.clear();
  }
}
