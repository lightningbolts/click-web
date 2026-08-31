import { normalizeEmail, sha256HexUtf8 } from '@/lib/connections/priorConnections';

export const MAX_GUEST_LIST_ENTRIES = 2000;
export const GUEST_LIST_SOURCES = ['csv', 'manual', 'instagram_import'] as const;
export type GuestListSource = (typeof GUEST_LIST_SOURCES)[number];

export type ParsedGuestEntry = {
  email: string | null;
  instagram_handle: string | null;
  email_hash: string | null;
};

const INSTAGRAM_HANDLE_RE = /^[a-z0-9._]{1,30}$/;

export function isGuestListSource(value: unknown): value is GuestListSource {
  return typeof value === 'string' && (GUEST_LIST_SOURCES as readonly string[]).includes(value);
}

export function normalizeInstagramHandle(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
  s = s.replace(/\/.*$/, '').replace(/^@/, '').toLowerCase();
  if (!INSTAGRAM_HANDLE_RE.test(s)) return null;
  return s;
}

export function parseGuestEntry(raw: {
  email?: string | null;
  instagram_handle?: string | null;
}): ParsedGuestEntry | null {
  const email = typeof raw.email === 'string' ? normalizeEmail(raw.email) : null;
  const handle =
    typeof raw.instagram_handle === 'string' ? normalizeInstagramHandle(raw.instagram_handle) : null;
  if (!email && !handle) return null;
  return {
    email,
    instagram_handle: handle,
    email_hash: email ? sha256HexUtf8(email) : null,
  };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function headerIndex(headers: string[], ...names: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  for (const name of names) {
    const idx = lower.indexOf(name);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Parse CSV or newline-delimited emails. Optional instagram / instagram_handle column. */
export function parseGuestCsv(text: string): ParsedGuestEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const firstCells = splitCsvLine(lines[0]).map((c) => c.replace(/^"|"$/g, ''));
  const looksLikeHeader = firstCells.some((c) =>
    /^(email|e-mail|instagram|instagram_handle|ig|handle)$/i.test(c.trim()),
  );

  let emailIdx = 0;
  let igIdx = -1;
  let start = 0;
  if (looksLikeHeader) {
    emailIdx = headerIndex(firstCells, 'email', 'e_mail', 'e-mail');
    igIdx = headerIndex(firstCells, 'instagram', 'instagram_handle', 'ig', 'handle');
    if (emailIdx < 0 && igIdx < 0) emailIdx = 0;
    start = 1;
  } else if (firstCells.length > 1) {
    igIdx = 1;
  }

  const seen = new Set<string>();
  const entries: ParsedGuestEntry[] = [];
  for (let i = start; i < lines.length; i += 1) {
    if (entries.length >= MAX_GUEST_LIST_ENTRIES) break;
    const cells = splitCsvLine(lines[i]).map((c) => c.replace(/^"|"$/g, ''));
    const parsed = parseGuestEntry({
      email: emailIdx >= 0 ? (cells[emailIdx] ?? '') : '',
      instagram_handle: igIdx >= 0 ? (cells[igIdx] ?? '') : '',
    });
    if (!parsed) continue;
    const key = parsed.email_hash ?? `ig:${parsed.instagram_handle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(parsed);
  }
  return entries;
}

export function parseGuestEntries(
  raw: Array<{ email?: string | null; instagram_handle?: string | null }>,
): ParsedGuestEntry[] {
  const seen = new Set<string>();
  const entries: ParsedGuestEntry[] = [];
  for (const row of raw) {
    if (entries.length >= MAX_GUEST_LIST_ENTRIES) break;
    const parsed = parseGuestEntry(row);
    if (!parsed) continue;
    const key = parsed.email_hash ?? `ig:${parsed.instagram_handle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(parsed);
  }
  return entries;
}

export function truncateEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const shown = local.slice(0, 1);
  return `${shown}***${domain}`;
}
