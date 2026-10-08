import { clampSelection, ctaLabel, selectionTotal } from '@/lib/ticketing/selection';
import type { TicketOffering } from '@/lib/ticketing/types';

const offering = (id: string, over: Partial<TicketOffering> = {}): TicketOffering => ({
  id,
  name: id.toUpperCase(),
  description: null,
  unit_amount: 1200,
  currency: 'usd',
  availability: 'on_sale',
  remaining: null,
  max_quantity: 8,
  sales_start_at: null,
  sales_end_at: null,
  ...over,
});

describe('clampSelection', () => {
  it('caps each line at what the buyer may take and drops what is no longer on sale', () => {
    const offerings = [offering('ga', { max_quantity: 2 }), offering('vip', { availability: 'sold_out', max_quantity: 0 }), offering('free', { unit_amount: 0 })];
    expect(clampSelection({ ga: 5, vip: 1, free: 1, gone: 3 }, offerings)).toEqual({ ga: 2, free: 1 });
  });

  it('drops zero and negative quantities', () => {
    expect(clampSelection({ ga: 0, vip: -1 }, [offering('ga'), offering('vip')])).toEqual({});
  });
});

describe('selectionTotal', () => {
  it('adds up the lines in offering order', () => {
    const offerings = [offering('ga'), offering('vip', { unit_amount: 2500 })];
    expect(selectionTotal({ vip: 1, ga: 2 }, offerings)).toEqual({
      lines: [
        { name: 'GA', quantity: 2, amount: 2400 },
        { name: 'VIP', quantity: 1, amount: 2500 },
      ],
      total: 4900,
      isFree: false,
      count: 3,
    });
  });

  it('knows a free order', () => {
    expect(selectionTotal({ free: 2 }, [offering('free', { unit_amount: 0 })])).toMatchObject({ total: 0, isFree: true, count: 2 });
  });

  it('is empty with nothing selected', () => {
    expect(selectionTotal({}, [offering('ga')])).toEqual({ lines: [], total: 0, isFree: false, count: 0 });
  });
});

describe('ctaLabel', () => {
  it.each([
    [{ total: 0, isFree: false, count: 0 }, 'Get tickets'],
    [{ total: 0, isFree: true, count: 1 }, 'Claim free ticket'],
    [{ total: 0, isFree: true, count: 2 }, 'Claim free tickets'],
    [{ total: 2400, isFree: false, count: 2 }, 'Checkout · $24.00'],
  ])('%o → %s', (total, label) => {
    expect(ctaLabel(total, 'usd')).toBe(label);
  });
});
