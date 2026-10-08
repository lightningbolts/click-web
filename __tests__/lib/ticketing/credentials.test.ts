/**
 * @jest-environment node
 */
import { mintTicketToken } from '@/lib/events/eventPass';
import { hashTicketToken, mintTicketNumber, mintTicketRow } from '@/lib/server/ticketing/credentials';

const key = Buffer.from('test-key');
const beacon = '3f2c1a7e-9b8d-4c6e-a1f0-2d3e4f5a6b7c';

describe('mintTicketRow', () => {
  it('stores the hash of the v2 token derived from the new ticket id', () => {
    const row = mintTicketRow(key, beacon);
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.token_hash).toBe(hashTicketToken(mintTicketToken(key, beacon, row.id)));
    expect(row.ticket_number).toMatch(/^CLK-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  });

  it('never repeats ids', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(mintTicketRow(key, beacon).id);
    expect(seen.size).toBe(200);
  });
});

describe('mintTicketNumber', () => {
  it('is human-safe and carries no sequence or PII', () => {
    const n = mintTicketNumber();
    expect(n).toMatch(/^CLK-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(n).not.toMatch(/[0O1I]/);
  });
});
