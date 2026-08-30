import HomeAuthenticated from '@/components/HomeAuthenticated';
import LandingPage from '@/components/landing/LandingPage';
import { EMPTY_PRESENCE_HEATMAP } from '@/lib/landing/presenceHeatmap';
import { getServerUser } from '@/lib/server/getServerUser';
import { loadPresenceHeatmap } from '@/lib/server/presenceHeatmap';

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

/**
 * Root route: resolve the cookie session on the server so anonymous crawlers
 * receive marketing HTML (not LoadingScreen). Logged-in users get the dashboard
 * without a marketing flash.
 */
export default async function Home() {
  const user = await getServerUser();
  if (user) {
    return <HomeAuthenticated user={user} />;
  }

  return (
    <>
      <CartoPreconnect />
      <LandingPage heatmap={await landingHeatmap()} />
    </>
  );
}
