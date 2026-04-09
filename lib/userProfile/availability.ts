/**
 * Normalizes availability fields that may arrive as JSON strings, corrupted tokens,
 * or non-arrays (legacy / double-encoded client payloads).
 */

export type AvailabilityIntentRow = {
  id: string;
  timeframe: string;
  intent_tag: string;
  expires_at: string;
};

/** True for empty strings and JSON-syntax junk accidentally stored as “tags”. */
export function isJunkAvailabilityToken(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^[\s\[\]",]+$/.test(t)) return true;
  if (t === '[' || t === ']' || t === '"' || t === "''" || t === '","') return true;
  if (t === '["' || t === '"]' || t === '", "' || t === '",') return true;
  return false;
}

/**
 * Coerces `unknown` into a clean `string[]`: parses JSON arrays, rejects junk tokens.
 */
export function normalizeStringArrayField(value: unknown): string[] {
  if (value == null) return [];

  const fromStrings = (items: unknown[]): string[] => {
    const out: string[] = [];
    for (const item of items) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed || isJunkAvailabilityToken(trimmed)) continue;
      out.push(trimmed);
    }
    return dedupePreserveOrder(out);
  };

  if (Array.isArray(value)) {
    const expanded: unknown[] = [];
    for (const el of value) {
      if (typeof el === 'string' && el.trim().startsWith('[')) {
        try {
          const inner = JSON.parse(el.trim()) as unknown;
          if (Array.isArray(inner)) {
            expanded.push(...inner);
            continue;
          }
        } catch {
          /* keep raw string */
        }
      }
      expanded.push(el);
    }
    return fromStrings(expanded);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return normalizeStringArrayField(parsed);
      }
    } catch {
      /* not JSON */
    }
    if (trimmed.includes(',')) {
      return fromStrings(trimmed.split(',').map((x) => x.trim()));
    }
    return isJunkAvailabilityToken(trimmed) ? [] : [trimmed];
  }

  return [];
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of items) {
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

/**
 * Turns a single `intent_tag` column value into display tags (handles stringified JSON arrays).
 */
export function normalizeIntentTagsFromField(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return normalizeStringArrayField(raw);
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t) as unknown;
        if (Array.isArray(parsed)) {
          return normalizeStringArrayField(parsed);
        }
      } catch {
        /* fall through */
      }
    }
    return normalizeStringArrayField(t);
  }
  return [];
}

function coerceNonEmptyString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (v != null && (typeof v === 'number' || typeof v === 'boolean')) return String(v);
  return '';
}

export function normalizeAvailabilityIntentRows(
  rows: unknown,
): AvailabilityIntentRow[] {
  if (!Array.isArray(rows)) return [];
  const out: AvailabilityIntentRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = r.id != null ? String(r.id).trim() : '';
    const timeframe = coerceNonEmptyString(r.timeframe).trim();
    const expires_at = coerceNonEmptyString(r.expires_at).trim();
    if (!id || !timeframe || !expires_at) {
      continue;
    }
    const tags = normalizeIntentTagsFromField(r.intent_tag);
    const fallback =
      typeof r.intent_tag === 'string' && r.intent_tag.trim() && tags.length === 0
        ? r.intent_tag.trim()
        : '';
    const effectiveTags = tags.length > 0 ? tags : fallback && !isJunkAvailabilityToken(fallback) ? [fallback] : [];

    for (let i = 0; i < effectiveTags.length; i++) {
      const tag = effectiveTags[i];
      if (!tag || isJunkAvailabilityToken(tag)) continue;
      out.push({
        id: effectiveTags.length > 1 ? `${id}::${i}` : id,
        timeframe,
        intent_tag: tag,
        expires_at,
      });
    }
  }
  return out;
}

export type LegacyAvailabilityShape = {
  is_free_this_week?: boolean | null;
  available_days?: unknown;
  preferred_activities?: unknown;
  custom_status?: string | null;
} | null;

/**
 * Returns a plain object safe to JSON-serialize: arrays are real arrays, not stringified.
 */
export function normalizeLegacyAvailabilityRecord(
  raw: LegacyAvailabilityShape,
): LegacyAvailabilityShape {
  if (!raw || typeof raw !== 'object') return raw;

  return {
    ...raw,
    available_days: normalizeStringArrayField(raw.available_days),
    preferred_activities: normalizeStringArrayField(raw.preferred_activities),
  };
}
