export function formatEventWhen(startIso: string | null, endIso: string | null): string | null {
  if (!startIso) return null;
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return null;
  const startLabel = new Date(startMs).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!endIso) return startLabel;
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(endMs)) return startLabel;
  const endLabel = new Date(endMs).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startLabel} – ${endLabel}`;
}
