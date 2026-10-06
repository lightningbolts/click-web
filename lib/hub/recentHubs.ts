/**
 * Hubs opened on this device, newest first (there's no "my hubs" endpoint yet). Per-viewer
 * convenience only: wrapped in try/catch and safe to lose.
 */
export type RecentHub = { id: string; name: string };

const KEY = 'click:recent-hubs';
const EVENT = 'click-recent-hubs';
const MAX = 20;

let cache: { raw: string | null; value: RecentHub[] } = { raw: null, value: [] };

export function readRecentHubs(): RecentHub[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cache.value;
  }
  if (raw === cache.raw) return cache.value;
  let value: RecentHub[] = [];
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) {
      value = parsed.filter(
        (h): h is RecentHub => !!h && typeof h.id === 'string' && typeof h.name === 'string',
      );
    }
  } catch {
    value = [];
  }
  cache = { raw, value };
  return value;
}

export function rememberHub(hub: RecentHub): void {
  const next = [hub, ...readRecentHubs().filter((h) => h.id !== hub.id)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

export function forgetHub(id: string): void {
  const next = readRecentHubs().filter((h) => h.id !== id);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeRecentHubs(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
