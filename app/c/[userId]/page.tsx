import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { APP_CONFIG } from '@/lib/config';

type PublicProfile = {
  display_name: string;
  avatar_url: string | null;
  aura_colors: string[];
};

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') || 'https://joinclick.co';
const IOS_APP_ID = process.env.NEXT_PUBLIC_IOS_APP_ID || '6757996346';

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  const origin = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '')
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const res = await fetch(`${origin}/api/users/${userId}/public-profile`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return res.json() as Promise<PublicProfile>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId } = await params;
  const profile = isUuidLike(userId) ? await fetchPublicProfile(userId) : null;
  const name = profile?.display_name ?? 'Click member';
  const universalLink = `${BASE_URL}/c/${userId}`;

  return {
    title: `Connect with ${name} on Click`,
    description: `${name} wants to connect with you on Click.`,
    other: {
      'apple-itunes-app': `app-id=${IOS_APP_ID}, app-argument=${universalLink}`,
    },
  };
}

export default async function ConnectionProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  if (!isUuidLike(userId)) notFound();

  const profile = await fetchPublicProfile(userId);
  if (!profile) notFound();

  const aura = profile.aura_colors?.length
    ? profile.aura_colors
    : ['#6366f1', '#a855f7', '#ec4899'];
  const gradient = `linear-gradient(135deg, ${aura.join(', ')})`;
  const deepLink = `click://connect/${userId}`;
  const universalLink = `${BASE_URL}/c/${userId}`;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-[150px] opacity-25"
          style={{ background: aura[0] }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-[150px] opacity-20"
          style={{ background: aura[aura.length - 1] }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-xl p-8 text-center shadow-2xl">
          <div
            className="w-24 h-24 mx-auto rounded-2xl mb-5 flex items-center justify-center text-3xl font-bold text-white overflow-hidden"
            style={{ background: gradient }}
          >
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              profile.display_name.charAt(0).toUpperCase()
            )}
          </div>

          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Connect on Click</p>
          <h1 className="text-2xl font-bold text-white mb-2">{profile.display_name}</h1>
          <p className="text-zinc-400 text-sm mb-8">
            Scan complete — open Click to start your connection.
          </p>

          <div className="space-y-3">
            <a
              href={deepLink}
              className="flex items-center justify-center w-full py-3.5 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: gradient }}
            >
              Open in Click
            </a>

            <a
              href={APP_CONFIG.ios_store_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3.5 bg-white text-black rounded-xl font-medium hover:bg-zinc-200 transition-colors"
            >
              Download on the App Store
            </a>

            <a
              href={APP_CONFIG.android_store_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3.5 bg-zinc-800 text-white rounded-xl font-medium hover:bg-zinc-700 transition-colors"
            >
              Get it on Google Play
            </a>
          </div>

          <p className="mt-6 text-[11px] text-zinc-600 break-all">{universalLink}</p>
        </div>
      </div>
    </div>
  );
}
