function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Parse event category / interest tags from beacon metadata. */
export function parseEventCategoryTags(metadata: Record<string, unknown>): string[] {
  const raw =
    metadata.event_categories ??
    metadata.eventCategories ??
    metadata.categories ??
    metadata.interest_tags ??
    metadata.interestTags ??
    metadata.tags;

  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length > 0 ? [t] : [];
  }
  if (!Array.isArray(raw)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let label: string | null = null;
    if (typeof item === "string") {
      label = item.trim();
    } else if (isRecord(item)) {
      const nested = item.tag ?? item.name ?? item.label ?? item.id;
      if (typeof nested === "string") label = nested.trim();
    }
    if (label == null || label.length === 0) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}
