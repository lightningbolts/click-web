import 'server-only';

import { createHmac } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runtimeEnv } from '@/lib/server/runtimeEnv';
import { eventPassCode, eventPassUrl, mintEventPassToken, mintTicketToken } from '@/lib/events/eventPass';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';
import { eventDisplayTitle, parseIsoMs } from '@/lib/events/eventMetadata';
import type { PublicEventPayload } from '@/lib/events/publicEvent';
import { buildPkpass, type PassSigner } from '@/lib/server/wallet/pkpass';
import { PASS_IMAGES } from '@/lib/server/wallet/passImages';

/** Server side of Click Pass (`lib/events/eventPass.ts` holds the credential format). */

const PUBLIC_BASE_URL = 'https://joinclick.co';

/**
 * The pass signing key: `EVENT_PASS_SECRET` when set, else derived from the service-role key
 * (always present server-side), so passes work without a new secret and rotate with either.
 */
export function eventPassKey(): Buffer | null {
  const explicit = runtimeEnv('EVENT_PASS_SECRET');
  if (explicit) return Buffer.from(explicit, 'utf8');
  const serviceRole = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRole) return null;
  return createHmac('sha256', serviceRole).update('click-pass-key:v1').digest();
}

export function publicBaseUrl(): string {
  return runtimeEnv('NEXT_PUBLIC_BASE_URL') ?? PUBLIC_BASE_URL;
}

export type IssuedPass = { token: string; url: string; code: string };

export function issueEventPass(key: Buffer, beaconId: string, userId: string): IssuedPass {
  const token = mintEventPassToken(key, beaconId, userId);
  return { token, url: eventPassUrl(publicBaseUrl(), beaconId, token), code: eventPassCode(token) };
}

/** A ticket's QR: the event URL carrying its stable v2 token. */
export function issueTicketCredential(key: Buffer, beaconId: string, ticketId: string): IssuedPass {
  const token = mintTicketToken(key, beaconId, ticketId);
  return { token, url: eventPassUrl(publicBaseUrl(), beaconId, token), code: eventPassCode(token) };
}

/** A pass belongs to people going (an approved RSVP); requests and waitlists have none yet. */
export async function isGoing(admin: SupabaseClient, beaconId: string, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('beacon_attendees')
    .select('user_id')
    .eq('beacon_id', beaconId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`event pass rsvp: ${error.message}`);
  return data != null;
}

export async function loadPassHolder(
  admin: SupabaseClient,
  userId: string,
): Promise<{ userId: string; name: string; avatarUrl: string | null }> {
  const { data, error } = await admin
    .from('users')
    .select('id, name, image, first_name, last_name')
    .eq('id', userId)
    .maybeSingle();
  // The host matches this face at the door; a failed read must not pass as a nameless guest.
  if (error) throw new Error(`event pass holder: ${error.message}`);
  const row = data as UserProfileRow | null;
  return { userId, name: displayNameFromUser(row, 'Guest'), avatarUrl: row?.image?.trim() || null };
}

export async function activeCheckIn(
  admin: SupabaseClient,
  beaconId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('event_check_ins')
    .select('checked_in_at, checked_out_at')
    .eq('beacon_id', beaconId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`event pass check-in: ${error.message}`);
  const row = data as { checked_in_at: string | null; checked_out_at: string | null } | null;
  return row && row.checked_out_at == null ? row.checked_in_at : null;
}

// --- Apple Wallet -------------------------------------------------------------

type WalletConfig = { passTypeIdentifier: string; teamIdentifier: string; signer: PassSigner };

/** Wallet passes need a Pass Type ID certificate; without one the app simply hides the button. */
export function walletConfig(): WalletConfig | null {
  const passTypeIdentifier = runtimeEnv('WALLET_PASS_TYPE_ID');
  const teamIdentifier = runtimeEnv('APPLE_TEAM_ID');
  const certificatePem = runtimeEnv('WALLET_PASS_CERT');
  const privateKeyPem = runtimeEnv('WALLET_PASS_KEY');
  const wwdrPem = runtimeEnv('WALLET_WWDR_CERT');
  if (!passTypeIdentifier || !teamIdentifier || !certificatePem || !privateKeyPem || !wwdrPem) return null;
  return { passTypeIdentifier, teamIdentifier, signer: { certificatePem, privateKeyPem, wwdrPem } };
}

/** White type over the event's colors; labels a step back so the values lead. */
const PASS_TYPE_COLORS = {
  foregroundColor: 'rgb(255, 255, 255)',
  labelColor: 'rgb(222, 222, 234)',
};

/** "SEP 27" in the event's own time zone, for the stacked-pass header. */
function headerDate(startMs: number, timeZone: string | null): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: timeZone ?? undefined })
      .format(new Date(startMs))
      .toUpperCase();
  } catch {
    return null;
  }
}

export function walletPassJson(args: {
  config: Pick<WalletConfig, 'passTypeIdentifier' | 'teamIdentifier'>;
  event: PublicEventPayload;
  pass: IssuedPass;
  holder: { userId: string; name: string };
  /** The card's color under its background picture (`passArt`). */
  backgroundColor: string;
  /** A ticket's pass: one per ticket, named by its type. `pass` is then the ticket's credential. */
  ticket?: { id: string; tierName: string };
}): Record<string, unknown> {
  const { event, pass } = args;
  const title = eventDisplayTitle(event.title, event.location_name);
  const startMs = parseIsoMs(event.event_start_at);
  const endMs = parseIsoMs(event.event_end_at);
  const startIso = startMs == null ? null : new Date(startMs).toISOString();
  const eventUrl = `${publicBaseUrl().replace(/\/$/, '')}/e/${event.beacon_id}`;
  // A Place hosting its own event is the host people recognize.
  const hostName = event.place?.name ?? event.host_name;

  const header = startMs == null ? null : headerDate(startMs, event.timezone);
  const secondary: Array<Record<string, unknown>> = [];
  if (startIso) {
    secondary.push(
      { key: 'date', label: 'DATE', value: startIso, dateStyle: 'PKDateStyleMedium', timeStyle: 'PKDateStyleNone' },
      { key: 'time', label: 'TIME', value: startIso, dateStyle: 'PKDateStyleNone', timeStyle: 'PKDateStyleShort' },
    );
  }
  const auxiliary: Array<Record<string, unknown>> = [{ key: 'guest', label: 'GUEST', value: args.holder.name }];
  if (args.ticket) auxiliary.push({ key: 'ticket', label: 'TICKET', value: args.ticket.tierName });
  if (event.location_name) auxiliary.push({ key: 'place', label: 'WHERE', value: event.location_name });

  const back: Array<Record<string, unknown>> = [
    { key: 'how', label: 'At the door', value: 'Show this code. Your host scans it to check you in.' },
  ];
  if (event.address) back.push({ key: 'address', label: 'Address', value: event.address });
  if (hostName) back.push({ key: 'host', label: 'Hosted by', value: hostName });
  back.push(
    { key: 'code', label: 'Pass', value: pass.code },
    { key: 'link', label: 'Event page', value: eventUrl, attributedValue: `<a href="${eventUrl}">Open in Click</a>` },
  );

  return {
    formatVersion: 1,
    passTypeIdentifier: args.config.passTypeIdentifier,
    teamIdentifier: args.config.teamIdentifier,
    serialNumber: args.ticket?.id ?? `${event.beacon_id}:${args.holder.userId}`,
    organizationName: 'Click',
    description: `Click Pass · ${title}`,
    logoText: 'Click',
    backgroundColor: args.backgroundColor,
    ...PASS_TYPE_COLORS,
    ...(startIso ? { relevantDate: startIso } : {}),
    // Greys out in Wallet a few hours after the event, like a used boarding pass.
    ...(endMs != null ? { expirationDate: new Date(endMs + 6 * 3_600_000).toISOString() } : {}),
    ...(event.latitude != null && event.longitude != null
      ? { locations: [{ latitude: event.latitude, longitude: event.longitude, relevantText: `${title} · Show your Click Pass` }] }
      : {}),
    barcodes: [{ format: 'PKBarcodeFormatQR', message: pass.url, messageEncoding: 'iso-8859-1', altText: pass.code }],
    eventTicket: {
      ...(header ? { headerFields: [{ key: 'day', label: 'DATE', value: header }] } : {}),
      primaryFields: [{ key: 'event', label: 'EVENT', value: title }],
      secondaryFields: secondary,
      auxiliaryFields: auxiliary,
      backFields: back,
    },
  };
}

/** The signed pass: its JSON, Click's icon and logo, and the event's artwork (`passArt`). */
export async function buildWalletPass(
  config: WalletConfig,
  passJson: Record<string, unknown>,
  art: Record<string, Buffer>,
): Promise<Buffer> {
  const images = Object.fromEntries(Object.entries(PASS_IMAGES).map(([name, b64]) => [name, Buffer.from(b64, 'base64')]));
  return buildPkpass(passJson, { ...images, ...art }, config.signer);
}
