import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Bell, Building2, KeyRound, Laptop, QrCode, ShieldCheck, Sparkles, Star, Store, Ticket, Trash2, UserX } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { StatusPill } from '@/components/ds/StatusPill';
import { CoreStrip } from '@/components/home/CoreStrip';
import { MeAvatar } from '@/components/me/MeAvatar';
import { MeSocial } from '@/components/me/MeSocial';
import { SignOutRow } from '@/components/me/SignOutRow';
import { AppearanceControl } from '@/components/settings/AppearanceSettings';
import { PERSONALITY_REQUIRED_TAG_COUNT } from '@/lib/personality/taxonomy';
import { loadMe } from '@/lib/server/me/loadMe';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { hasTicketWallet } from '@/lib/server/ticketing/flags';
import { settingsHref } from '@/lib/settings/sections';

export const metadata: Metadata = { title: 'Me · Click' };

/** Me (spec §7.7): identity on the left, everything about you as grouped lists on the right. */
export default async function MePage() {
  const me = await loadMe();
  if (!me) redirect('/login?next=/me');
  const { viewer } = me;
  const ticketWallet = await hasTicketWallet(createAdminSupabaseClient(), viewer.id).catch(() => false);
  const latestExpiry = Math.max(0, ...me.intents.map((i) => Date.parse(i.expires_at) || 0));
  const untilLabel = latestExpiry
    ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: me.timeZone }).format(latestExpiry)
    : null;

  return (
    <div className="container-page pb-16 pt-6 md:pt-10">
      <div className="grid gap-10 md:grid-cols-[360px_minmax(0,1fr)]">
        <section aria-labelledby="me-name" className="flex flex-col gap-8 md:sticky md:top-[calc(var(--topbar-height)+24px)] md:self-start">
          <div>
            <MeAvatar id={viewer.id} name={viewer.name} src={viewer.avatarUrl} />
            <h1 id="me-name" className="type-title-2 mt-4 text-fg">
              {viewer.name}
            </h1>
            {viewer.bio ? <p className="type-body mt-1 max-w-[44ch] text-fg-secondary">{viewer.bio}</p> : null}
            <p className="type-meta tabular mt-2 text-fg-tertiary">
              {me.clicksCount} {me.clicksCount === 1 ? 'Click' : 'Clicks'}
            </p>
            {me.intents.length > 0 ? (
              <StatusPill variant="tinted" className="mt-3">
                Down for {me.intents[0].intent_tag}
              </StatusPill>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" href={settingsHref('profile')}>
                Edit profile
              </Button>
              <Button variant="secondary" size="sm" href="/add" icon={QrCode}>
                My QR
              </Button>
            </div>
          </div>
          {me.core.length > 0 ? <CoreStrip people={me.core} /> : null}
        </section>

        <div className="flex flex-col gap-8">
          <MeSocial intents={me.intents} placesEnabled={me.placesEnabled} untilLabel={untilLabel} />

          {ticketWallet ? (
            <ListGroup>
              <ListRow icon={Ticket} title="Tickets" href="/tickets" chevron />
            </ListGroup>
          ) : null}

          <ListGroup header="Preferences">
            <ListRow icon={Bell} title="Notifications" href={settingsHref('notifications')} chevron />
            <ListRow icon={ShieldCheck} title="Privacy & location" href={settingsHref('privacy')} chevron />
            <ListRow icon={Star} title="Interests" href={settingsHref('interests')} trailing={<span className="tabular">{me.interestsCount}</span>} chevron />
            <ListRow
              icon={Sparkles}
              title="Personality"
              href={settingsHref('personality')}
              trailing={<span className="tabular">{`${me.personalityCount} of ${PERSONALITY_REQUIRED_TAG_COUNT}`}</span>}
              chevron
            />
          </ListGroup>

          <section aria-labelledby="me-appearance">
            <h2 id="me-appearance" className="type-meta mb-2 px-4 font-semibold text-fg-secondary">
              Appearance
            </h2>
            <AppearanceControl />
          </section>

          <ListGroup header="Business">
            {me.managesPlaces ? (
              <ListRow icon={Building2} title="Your Places" href="/business/places" chevron />
            ) : (
              <ListRow icon={Store} title="Set up a Place" subtitle="Free for any café, venue or club" href="/business/get-started" chevron />
            )}
          </ListGroup>

          <ListGroup header="Account" footer={`Click for web · ${process.env.NEXT_PUBLIC_BUILD_VERSION ?? 'dev'}`}>
            <ListRow icon={Laptop} title="Devices" href={settingsHref('devices')} chevron />
            <ListRow icon={UserX} title="Blocked people" href={settingsHref('blocked')} chevron />
            <ListRow icon={KeyRound} title="Password" href={settingsHref('account')} chevron />
            <SignOutRow />
            <ListRow icon={Trash2} title="Delete account" href={settingsHref('account')} destructive />
          </ListGroup>
        </div>
      </div>
    </div>
  );
}
