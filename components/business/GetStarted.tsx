'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BadgeCheck, Building2, Plus, QrCode, Rocket } from 'lucide-react';
import { AuthForm } from '@/components/auth/AuthForm';
import { Button } from '@/components/ds/Button';
import { cardClassName } from '@/components/ds/Card';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { useAuth } from '@/lib/AuthContext';
import type { ManagerPlace } from '@/lib/server/places/serialize';
import { NewPlaceForm } from './NewPlaceForm';

const NEXT_STEPS = [
  { icon: BadgeCheck, title: 'We review your Place', body: 'Usually within one business day. Finish your profile meanwhile.' },
  { icon: QrCode, title: 'Print your check-in QR', body: 'Put it by the door or counter so guests can check in.' },
  { icon: Rocket, title: 'Go live', body: 'Your pin, Place page and events show to people nearby.' },
];

function Step({ n, title, current, children }: { n: number; title: string; current: boolean; children?: React.ReactNode }) {
  return (
    <section aria-labelledby={`get-started-${n}`} aria-current={current ? 'step' : undefined}>
      <h2 id={`get-started-${n}`} className="type-meta mb-3 font-semibold text-fg-secondary">
        Step {n} of 3 · {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Business onboarding (spec §9.6): account → your Place → what's next. Setting up a Place is free;
 * nothing here asks for payment.
 */
export function GetStarted({
  signedIn,
  managed,
  lastPlace,
  checkout,
}: {
  signedIn: boolean;
  managed: number;
  lastPlace: { id: string; name: string } | null;
  /** Legacy `?checkout=` from the retired signup flow (kept for one release). */
  checkout: 'success' | 'canceled' | null;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [created, setCreated] = useState<ManagerPlace | null>(null);
  const [adding, setAdding] = useState(managed === 0);

  // Signing in on this page: re-render on the server with the session.
  useEffect(() => {
    if (!signedIn && user) router.refresh();
  }, [signedIn, user, router]);

  const notice =
    checkout === 'success' ? (
      <InlineNotice variant="info" className="mb-6">
        Your payment went through. It can take a minute to show on your Place.
      </InlineNotice>
    ) : checkout === 'canceled' ? (
      <InlineNotice className="mb-6">Checkout was canceled. Nothing was charged.</InlineNotice>
    ) : null;

  if (created) {
    return (
      <>
        <Step n={3} title="What’s next" current>
          <div className={cardClassName({ className: 'flex flex-col gap-5' })}>
            <p className="type-title-3 text-fg">{created.name} is set up</p>
            <ol className="flex flex-col gap-4">
              {NEXT_STEPS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-selection text-accent">
                    <Icon size={20} aria-hidden />
                  </span>
                  <span>
                    <span className="type-body-strong block text-fg">{title}</span>
                    <span className="type-meta block text-fg-secondary">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" href={`/business/places/${created.id}`}>
                Open your Place
              </Button>
              <Button variant="secondary" href={`/business/places/${created.id}/billing`}>
                See what Click for Business adds
              </Button>
            </div>
          </div>
        </Step>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {notice}
      <Step n={1} title="Your account" current={!signedIn}>
        {signedIn ? (
          managed > 0 ? (
            <div className={cardClassName({ className: 'flex flex-col gap-4' })}>
              <p className="type-body text-fg">
                You manage {managed} {managed === 1 ? 'Place' : 'Places'}.
              </p>
              <div className="flex flex-wrap gap-2">
                {lastPlace ? (
                  <Button variant="primary" icon={Building2} href={`/business/places/${lastPlace.id}`}>
                    Open {lastPlace.name}
                  </Button>
                ) : null}
                {!adding ? (
                  <Button variant="secondary" icon={Plus} onClick={() => setAdding(true)}>
                    Add another Place
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="type-body text-fg-secondary">You’re signed in. Next, tell us about your Place.</p>
          )
        ) : (
          <div className="-mx-[var(--gutter)] sm:mx-0">
            <AuthForm mode="signup" next="/business/get-started" />
          </div>
        )}
      </Step>
      {signedIn && adding ? (
        <Step n={2} title="Your Place" current>
          <NewPlaceForm onCreated={setCreated} />
        </Step>
      ) : null}
    </div>
  );
}
