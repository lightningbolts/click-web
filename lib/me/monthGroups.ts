/** Groups newest-first items under "October 2026"-style month headings in `timeZone`. */
export function groupByMonth<T>(items: readonly T[], at: (item: T) => number, timeZone: string): { key: string; title: string; items: T[] }[] {
  const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' });
  const titleFmt = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'long' });
  const out: { key: string; title: string; items: T[] }[] = [];
  for (const item of items) {
    const ms = at(item);
    if (!Number.isFinite(ms)) continue;
    const key = keyFmt.format(ms);
    let group = out.at(-1);
    if (!group || group.key !== key) {
      group = { key, title: titleFmt.format(ms), items: [] };
      out.push(group);
    }
    group.items.push(item);
  }
  return out;
}
