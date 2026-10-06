import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BIZ_PLACE_COOKIE, resolveBusinessPlace, safeWorkspaceSuffix } from '@/lib/places/workspace';
import { getServerUser } from '@/lib/server/getServerUser';
import { loadManagedPlaces } from '@/lib/server/places/workspace';
import { loginHref } from '@/lib/shell/appNav';

/**
 * `/business` resolver (spec §9.2): no Places → get-started; otherwise the last-used Place (the
 * `click_biz_place` cookie, if you still manage it) or the first by name, honoring `?to=`.
 */
export default async function BusinessResolver({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const [user, sp, jar] = await Promise.all([getServerUser(), searchParams, cookies()]);
  if (!user) redirect(loginHref(`/business${sp.to ? `?to=${encodeURIComponent(sp.to)}` : ''}`));
  const places = await loadManagedPlaces(user.id);
  const placeId = resolveBusinessPlace(places, jar.get(BIZ_PLACE_COOKIE)?.value);
  if (!placeId) redirect('/business/get-started');
  redirect(`/business/places/${placeId}${safeWorkspaceSuffix(sp.to)}`);
}
