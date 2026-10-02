/** Place slugs (§4.2). Same rule as the `places_slug_format` DB constraint. */

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_BASE = 60;

function slugPart(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cutAtBoundary(slug: string, max: number): string {
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, '');
}

export function slugifyPlaceName(name: string, city?: string | null): string {
  const base = cutAtBoundary(slugPart(name), MAX_BASE);
  const citySlug = city ? slugPart(city) : '';
  return [base, citySlug].filter(Boolean).join('-');
}

export function isValidSlug(s: string): boolean {
  return typeof s === 'string' && s.length >= 3 && s.length <= 80 && SLUG_RE.test(s);
}

/** Candidates the server tries in order: `slug`, `slug-2`, … `slug-20` (then 409). */
export function slugCandidates(base: string): string[] {
  const out = [base];
  for (let i = 2; i <= 20; i += 1) out.push(`${base}-${i}`);
  return out;
}
