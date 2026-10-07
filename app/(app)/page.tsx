import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { HomeGreeting } from '@/components/home/HomeGreeting';
import { HomeSkeleton, HomeView } from '@/components/home/HomeView';
import LandingPage from '@/components/landing/LandingPage';
import { hourIn } from '@/lib/home/selectOpportunity';
import { EMPTY_PRESENCE_HEATMAP } from '@/lib/landing/presenceHeatmap';
import { getServerUser } from '@/lib/server/getServerUser';
import { loadHome } from '@/lib/server/home/loadHome';
import { loadPresenceHeatmap } from '@/lib/server/presenceHeatmap';
import { loadViewerName } from '@/lib/server/session';
import { TIME_ZONE_COOKIE, validTimeZone } from '@/lib/time/viewerTimeZone';

async function landingHeatmap() {
  try {
    return await loadPresenceHeatmap();
  } catch (err) {
    console.error('Presence heatmap load failed:', err);
    return EMPTY_PRESENCE_HEATMAP;
  }
}

function CartoPreconnect() {
  return (
    <>
      <link rel="preconnect" href="https://basemaps.cartocdn.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://a.basemaps.cartocdn.com" crossOrigin="anonymous" />
    </>
  );
}

/** The server's best guess at the viewer's hour; the greeting re-checks on the client. */
function currentHourIn(timeZone: string): number {
  return hourIn(Date.now(), timeZone);
}

async function HomeContent() {
  const data = await loadHome();
  if (!data) return null;
  return <HomeView data={data} />;
}

/** Signed-in Home (spec §7.1), inside the `(app)` shell: greeting paints first, modules stream in. */
async function SignedInHome() {
  const [name, jar] = await Promise.all([loadViewerName(), cookies()]);
  const timeZone = validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value) ?? 'UTC';
  const firstName = name?.split(' ')[0] ?? '';
  return (
    <div className="container-page pb-16 pt-6 md:pt-10">
      <div className="mb-8 lg:max-w-[680px]">
        <HomeGreeting firstName={firstName} serverHour={currentHourIn(timeZone)} />
      </div>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}

/**
 * Root route: resolve the cookie session on the server so anonymous crawlers receive marketing
 * HTML (no loading gate). Signed-in people get Home with no marketing flash.
 */
export default async function Home() {
  const user = await getServerUser();
  if (user) return <SignedInHome />;

  return (
    <>
      <CartoPreconnect />
      <LandingPage heatmap={await landingHeatmap()} />
    </>
  );
}
