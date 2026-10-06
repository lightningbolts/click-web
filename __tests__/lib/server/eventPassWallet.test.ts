/** @jest-environment node */
import { issueEventPass, walletPassJson } from '@/lib/server/eventPass';
import type { PublicEventPayload } from '@/lib/events/publicEvent';

const beacon = '3f2c1a7e-9b8d-4c6e-a1f0-2d3e4f5a6b7c';
const user = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const event = {
  beacon_id: beacon,
  title: 'Run Club',
  location_name: 'Burke-Gilman Trail',
  address: null,
  event_start_at: '2026-09-28T04:30:00.000Z', // Sep 27, 9:30 PM in Seattle
  event_end_at: '2026-09-28T06:00:00.000Z',
  timezone: 'America/Los_Angeles',
  latitude: 47.66,
  longitude: -122.3,
  host_name: 'Kairui',
  place: null,
} as unknown as PublicEventPayload;

describe('Wallet pass JSON', () => {
  const pass = issueEventPass(Buffer.from('k'), beacon, user);
  const json = walletPassJson({
    config: { passTypeIdentifier: 'pass.co.joinclick.event', teamIdentifier: 'TEAM' },
    event,
    pass,
    holder: { userId: user, name: 'Ada' },
    backgroundColor: 'rgb(20, 10, 40)',
  });
  const ticket = json.eventTicket as Record<string, Array<Record<string, unknown>>>;

  it('wears the event colors with Click branding', () => {
    expect(json).toMatchObject({ logoText: 'Click', backgroundColor: 'rgb(20, 10, 40)', foregroundColor: 'rgb(255, 255, 255)' });
  });

  it('puts the date in the event’s own time zone on the stacked header', () => {
    expect(ticket.headerFields).toEqual([{ key: 'day', label: 'DATE', value: 'SEP 27' }]);
  });

  it('carries the same QR credential as the app', () => {
    expect(json.barcodes).toEqual([expect.objectContaining({ format: 'PKBarcodeFormatQR', message: pass.url, altText: pass.code })]);
    expect(ticket.primaryFields?.[0]).toMatchObject({ key: 'event', value: 'Run Club' });
  });
});
