import 'server-only';

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripe, getAppBaseUrl } from '@/lib/server/stripe';
import { accountRowPatch, type StripeAccountSnapshot } from '@/lib/server/ticketing/accountState';

export type OrganizerAccountRow = {
  id: string;
  owner_user_id: string;
  stripe_account_id: string;
  livemode: boolean;
  onboarding_state: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  transfers_enabled: boolean;
  details_submitted: boolean;
  requirements_currently_due_count: number;
  requirements_eventually_due_count: number;
  requirements_disabled_reason: string | null;
  last_stripe_sync_at: string | null;
};

export function snapshotFromStripeAccount(account: Stripe.Account): StripeAccountSnapshot {
  return {
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
    transfersActive: account.capabilities?.transfers === 'active',
    detailsSubmitted: account.details_submitted === true,
    currentlyDueCount: account.requirements?.currently_due?.length ?? 0,
    eventuallyDueCount: account.requirements?.eventually_due?.length ?? 0,
    disabledReason: account.requirements?.disabled_reason ?? null,
  };
}

export async function loadOrganizerAccount(
  admin: SupabaseClient,
  ownerUserId: string,
): Promise<OrganizerAccountRow | null> {
  const { data, error } = await admin
    .from('organizer_payment_accounts')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();
  if (error) throw new Error(`organizer_payment_accounts load failed: ${error.message}`);
  return (data as OrganizerAccountRow | null) ?? null;
}

/**
 * Load-or-create the organizer's connected Stripe account (Express).
 * Idempotent: one account per organizer principal in v1.
 */
export async function ensureOrganizerAccount(
  admin: SupabaseClient,
  ownerUserId: string,
  ownerEmail: string | null,
): Promise<OrganizerAccountRow> {
  const existing = await loadOrganizerAccount(admin, ownerUserId);
  if (existing) return existing;

  const stripe = getStripe();
  const account = await stripe.accounts.create(
    {
      type: 'express',
      country: 'US',
      email: ownerEmail ?? undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { click_user_id: ownerUserId },
    },
    { idempotencyKey: `connect-account:${ownerUserId}` },
  );

  const { data, error } = await admin
    .from('organizer_payment_accounts')
    .upsert(
      {
        owner_user_id: ownerUserId,
        stripe_account_id: account.id,
        livemode: !(process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test'),
        onboarding_state: 'in_progress',
      },
      { onConflict: 'owner_user_id' },
    )
    .select('*')
    .single();
  if (error) throw new Error(`organizer_payment_accounts upsert failed: ${error.message}`);
  return data as OrganizerAccountRow;
}

/**
 * Single-use hosted onboarding link. Never stored: possession grants access
 * to sensitive onboarding context and Stripe treats links as single-use.
 */
export async function createOnboardingLink(stripeAccountId: string): Promise<string> {
  const stripe = getStripe();
  const base = getAppBaseUrl();
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    type: 'account_onboarding',
    refresh_url: `${base}/payments/connect/refresh`,
    return_url: `${base}/payments/connect/return`,
  });
  return link.url;
}

/**
 * Pull the live account from Stripe and persist normalized readiness.
 * Returning from the hosted flow proves nothing; this is the authority.
 */
export async function syncOrganizerAccount(
  admin: SupabaseClient,
  row: OrganizerAccountRow,
): Promise<OrganizerAccountRow> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(row.stripe_account_id);
  return applyAccountSnapshot(admin, row.stripe_account_id, snapshotFromStripeAccount(account));
}

/** Shared by the status sync and the account.updated webhook. */
export async function applyAccountSnapshot(
  admin: SupabaseClient,
  stripeAccountId: string,
  snapshot: StripeAccountSnapshot,
): Promise<OrganizerAccountRow> {
  const { data, error } = await admin
    .from('organizer_payment_accounts')
    .update(accountRowPatch(snapshot))
    .eq('stripe_account_id', stripeAccountId)
    .select('*')
    .single();
  if (error) throw new Error(`organizer_payment_accounts sync failed: ${error.message}`);
  return data as OrganizerAccountRow;
}
