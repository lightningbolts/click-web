import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Check, Lock } from 'lucide-react';
import { BillingAction } from '@/components/business/BillingActions';
import { INSIGHTS_FEATURES } from '@/lib/places/workspace';
import { cardClassName } from '@/components/ds/Card';
import { EmptyState } from '@/components/ds/EmptyState';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { StatusPill, type StatusPillVariant } from '@/components/ds/StatusPill';
import { getStripe } from '@/lib/server/stripe';
import { loadWorkspace } from '@/lib/server/places/workspace';

export const metadata: Metadata = { title: 'Billing · Business · Click', robots: { index: false } };

const STATUS: Record<string, { label: string; variant: StatusPillVariant }> = {
  active: { label: 'Active', variant: 'success' },
  trialing: { label: 'Trial', variant: 'tinted' },
  past_due: { label: 'Payment due', variant: 'warning' },
  unpaid: { label: 'Payment due', variant: 'warning' },
  canceled: { label: 'Canceled', variant: 'neutral' },
  incomplete: { label: 'Incomplete', variant: 'warning' },
};

/** Renewal date, read from Stripe on demand (it isn't stored on the Place). */
async function renewal(subscriptionId: string | null): Promise<{ at: number; cancels: boolean } | null> {
  if (!subscriptionId || !process.env.STRIPE_SECRET_KEY) return null;
  try {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId);
    const end = sub.items.data[0]?.current_period_end;
    return end ? { at: end * 1000, cancels: sub.cancel_at_period_end } : null;
  } catch (e) {
    console.warn('[billing] renewal:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Billing (spec §9.5): owner only. Upgrading is per Place and never creates a Place. */
export default async function PlaceBillingPage({ params, searchParams }: { params: Promise<{ placeId: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const [{ placeId }, sp] = await Promise.all([params, searchParams]);
  const ws = await loadWorkspace(placeId);
  if (ws.kind !== 'ok') notFound();
  const { place } = ws;
  if (place.role !== 'owner') {
    return <EmptyState icon={Lock} title="Only the owner manages billing" body="Ask the owner of this Place about its plan." />;
  }
  const status = place.subscription_status ?? 'inactive';
  const pill = STATUS[status];
  const hasCustomer = Boolean(place.stripe?.customerId);
  const next = place.entitled ? await renewal(place.stripe?.subscriptionId ?? null) : null;
  const date = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="flex max-w-[640px] flex-col gap-6">
      {sp.checkout === 'success' ? (
        <InlineNotice variant="info">Thanks. Your upgrade is being confirmed and will show here in a minute.</InlineNotice>
      ) : sp.checkout === 'canceled' ? (
        <InlineNotice>Checkout was canceled. Nothing was charged.</InlineNotice>
      ) : null}

      <section aria-labelledby="billing-plan" className={cardClassName({ className: 'flex flex-col gap-4' })}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="billing-plan" className="type-headline text-fg">
            {place.entitled ? 'Click for Business' : 'Free'}
          </h2>
          {pill ? <StatusPill variant={pill.variant}>{pill.label}</StatusPill> : <StatusPill>Free</StatusPill>}
        </div>
        {place.entitled ? (
          <p className="type-body text-fg-secondary">
            {next ? (next.cancels ? `Ends ${date.format(next.at)}.` : `Renews ${date.format(next.at)}.`) : 'Insights are on for this Place.'}
          </p>
        ) : (
          <>
            <p className="type-body text-fg-secondary">
              Your Place, check-ins, events and the last 30 days of stats are free. Click for Business adds Insights for this
              Place only.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {INSIGHTS_FEATURES.map((f) => (
                <li key={f} className="type-body flex items-center gap-2 text-fg">
                  <Check size={16} aria-hidden className="text-accent" />
                  {f}
                </li>
              ))}
            </ul>
          </>
        )}
        {status === 'past_due' || status === 'unpaid' ? (
          <InlineNotice variant="warning">The last payment didn’t go through. Update your card to keep Insights on.</InlineNotice>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {!place.entitled ? <BillingAction placeId={place.id} kind="checkout" /> : null}
          {hasCustomer ? <BillingAction placeId={place.id} kind="portal" /> : null}
        </div>
      </section>
      <p className="type-meta px-1 text-fg-tertiary">Payments are handled by Stripe. Each Place has its own plan.</p>
    </div>
  );
}
