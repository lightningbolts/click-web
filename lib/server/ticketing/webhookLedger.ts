import 'server-only';

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ledger semantics on stripe_webhook_events for ticketing events.
 *
 * Insert-first gives the same duplicate guard the venue flow uses, but a
 * ticketing handler failure must stay retryable: the row is marked failed and
 * a Stripe redelivery of the same event id is allowed to process again.
 */

export type LedgerDecision = { process: boolean; duplicate: boolean };

export async function recordTicketingWebhookEvent(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<LedgerDecision> {
  const object = event.data.object as { id?: string };
  const { error } = await admin.from('stripe_webhook_events').insert({
    id: event.id,
    stripe_event_type: event.type,
    stripe_object_id: typeof object.id === 'string' ? object.id : null,
    livemode: event.livemode,
    payload: event.data.object as unknown as Record<string, unknown>,
    processing_state: 'processing',
    attempt_count: 1,
  });
  if (!error) return { process: true, duplicate: false };
  if (error.code !== '23505') {
    // Ledger unavailable: process anyway rather than dropping a payment
    // event; the RPCs are idempotent.
    console.error('Ticketing webhook ledger insert failed:', error.message);
    throw new Error('Ticketing ledger unavailable');
  }

  const { data, error: readError } = await admin
    .from('stripe_webhook_events')
    .select('processing_state, attempt_count')
    .eq('id', event.id)
    .maybeSingle();
  if (readError || !data) throw new Error('Ticketing ledger unavailable');
  const row = data as { processing_state: string; attempt_count: number };
  if (row.processing_state === 'processed' || row.processing_state === 'ignored') {
    return { process: false, duplicate: true };
  }

  await admin
    .from('stripe_webhook_events')
    .update({ processing_state: 'processing', attempt_count: row.attempt_count + 1 })
    .eq('id', event.id);
  return { process: true, duplicate: true };
}

export async function markTicketingWebhookOutcome(
  admin: SupabaseClient,
  eventId: string,
  outcome: 'processed' | 'ignored' | 'retryable_failure' | 'needs_attention' | 'failed',
  lastError?: string,
): Promise<void> {
  const { error } = await admin
    .from('stripe_webhook_events')
    .update({
      processing_state: outcome,
      last_error: ['failed', 'retryable_failure', 'needs_attention'].includes(outcome)
        ? (lastError ?? 'unknown error')
        : null,
      processed_at: outcome === 'processed' ? new Date().toISOString() : null,
    })
    .eq('id', eventId);
  if (error) throw new Error(`Ticketing webhook ledger update failed: ${error.message}`);
}
