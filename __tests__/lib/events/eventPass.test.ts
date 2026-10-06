/** @jest-environment node */
import {
  eventPassCode,
  eventPassUrl,
  mintEventPassToken,
  parsePassCredential,
  verifyEventPassToken,
} from '@/lib/events/eventPass';

const key = Buffer.from('test-key');
const beacon = '3f2c1a7e-9b8d-4c6e-a1f0-2d3e4f5a6b7c';
const user = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

describe('Click Pass credentials', () => {
  const token = mintEventPassToken(key, beacon, user);

  it('round-trips the holder for the event it was issued for', () => {
    expect(verifyEventPassToken(key, beacon, token)).toBe(user);
  });

  it('is stable, so a Wallet copy and the in-app QR are the same pass', () => {
    expect(mintEventPassToken(key, beacon, user)).toBe(token);
  });

  it('rejects another event, another key, and tampering', () => {
    expect(verifyEventPassToken(key, '3f2c1a7e-9b8d-4c6e-a1f0-2d3e4f5a6b7d', token)).toBeNull();
    expect(verifyEventPassToken(Buffer.from('other'), beacon, token)).toBeNull();
    const [v, u, s] = token.split('.');
    const otherUser = mintEventPassToken(key, beacon, '00000000-0000-4000-8000-000000000000').split('.')[1];
    expect(verifyEventPassToken(key, beacon, [v, otherUser, s].join('.'))).toBeNull();
    expect(verifyEventPassToken(key, beacon, [v, u, s, 'x'].join('.'))).toBeNull();
    expect(verifyEventPassToken(key, beacon, `2.${u}.${s}`)).toBeNull();
    expect(verifyEventPassToken(key, beacon, 'garbage')).toBeNull();
  });

  it('encodes the public event URL so other cameras land on the event page', () => {
    const url = eventPassUrl('https://joinclick.co/', beacon, token);
    expect(url).toBe(`https://joinclick.co/e/${beacon}?pass=${token}`);
    expect(parsePassCredential(url)).toEqual({ ok: true, beaconId: beacon, token });
    expect(parsePassCredential(`  ${token} `)).toEqual({ ok: true, beaconId: null, token });
    expect(parsePassCredential('https://joinclick.co/e/x')).toEqual({ ok: false });
    expect(parsePassCredential('')).toEqual({ ok: false });
  });

  it('shows a short unambiguous code', () => {
    expect(eventPassCode(token)).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
    expect(eventPassCode(token)).toBe(eventPassCode(token));
  });
});
