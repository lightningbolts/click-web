import { fetchClickPass, fetchTicketPass, isAppleSafari, isAtTheDoor } from '@/lib/events/eventPassClient';

const mockFetchEventTickets = jest.fn();
jest.mock('@/lib/ticketing/ticketingClient', () => ({ fetchEventTickets: (...a: unknown[]) => mockFetchEventTickets(...a) }));

jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({}) }));

const H = 3_600_000;

describe('Click Pass client', () => {
  afterEach(() => {
    (global as { fetch?: unknown }).fetch = undefined;
  });

  it('maps the API statuses to what the pass screen shows', async () => {
    const pass = { credential_url: 'u', code: 'K7P-4QX', checked_in_at: null, wallet_available: false };
    const respond = (status: number, body: unknown = {}) =>
      ((global as { fetch?: unknown }).fetch = jest.fn(async () => ({ status, ok: status < 400, json: async () => body })));
    respond(200, pass);
    await expect(fetchClickPass('/p')).resolves.toEqual({ kind: 'ready', pass });
    respond(403);
    await expect(fetchClickPass('/p')).resolves.toEqual({ kind: 'not_going' });
    respond(503);
    await expect(fetchClickPass('/p')).resolves.toEqual({ kind: 'unavailable' });
    respond(500);
    await expect(fetchClickPass('/p')).rejects.toThrow('pass 500');
  });

  it('on a ticketed event, shows tickets, else the RSVP pass a guest already had', async () => {
    const pass = { credential_url: 'u', code: 'K7P-4QX', checked_in_at: null, wallet_available: false };
    const ticket = { id: 't1' };
    mockFetchEventTickets.mockResolvedValueOnce([ticket]);
    await expect(fetchTicketPass('b1')).resolves.toEqual({ kind: 'tickets', tickets: [ticket] });

    mockFetchEventTickets.mockResolvedValueOnce([]);
    const fetch = jest.fn(async () => ({ status: 200, ok: true, json: async () => pass }));
    (global as { fetch?: unknown }).fetch = fetch;
    await expect(fetchTicketPass('b1')).resolves.toEqual({ kind: 'ready', pass });
    expect(fetch).toHaveBeenCalledWith('/api/beacons/b1/pass', expect.anything());

    mockFetchEventTickets.mockResolvedValueOnce([]);
    (global as { fetch?: unknown }).fetch = jest.fn(async () => ({ status: 403, ok: false, json: async () => ({}) }));
    await expect(fetchTicketPass('b1')).resolves.toEqual({ kind: 'not_going' });
  });

  it('is at the door from an hour before the start until the end', () => {
    const start = 10 * H;
    expect(isAtTheDoor(start, start + 3 * H, start - 2 * H)).toBe(false);
    expect(isAtTheDoor(start, start + 3 * H, start - 0.5 * H)).toBe(true);
    expect(isAtTheDoor(start, start + 3 * H, start + H)).toBe(true);
    expect(isAtTheDoor(start, start + 3 * H, start + 3 * H)).toBe(false);
    expect(isAtTheDoor(null, null, start)).toBe(false);
  });

  it('offers Wallet only in Apple Safari', () => {
    const iosSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1';
    const macSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15';
    const macChrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
    const iosChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1';
    const android = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
    expect([iosSafari, macSafari, macChrome, iosChrome, android].map(isAppleSafari)).toEqual([true, true, false, false, false]);
  });
});
