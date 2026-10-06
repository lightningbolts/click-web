/** @jest-environment node */
import { hashContacts, normalizeEmail, normalizePhoneE164, sha256Hex } from '@/lib/contacts/contactHash';

describe('contact hashing (iOS parity)', () => {
  it('normalizes emails', () => {
    expect(normalizeEmail('  Ana@Example.COM ')).toBe('ana@example.com');
    expect(normalizeEmail('nope')).toBeNull();
  });

  it.each([
    ['(206) 555-0100', '+12065550100'],
    ['1 206 555 0100', '+12065550100'],
    ['+44 20 7946 0958', '+442079460958'],
    ['555-0100', null],
  ])('normalizes phone %s', (raw, out) => {
    expect(normalizePhoneE164(raw)).toBe(out);
  });

  it('hashes lowercase hex SHA-256 and dedupes', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const hashes = await hashContacts(['a@b.co', 'A@B.co ', '2065550100', 'x']);
    expect(hashes).toHaveLength(2);
  });
});
