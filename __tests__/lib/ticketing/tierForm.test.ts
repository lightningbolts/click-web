import { emptyTierDraft, parsePriceText, priceText, tierDraftFrom, validateTierDraft, type TierDraft } from '@/lib/ticketing/tierForm';
import type { ManagedTier } from '@/lib/ticketing/types';

const TZ = 'America/Los_Angeles';
const draft = (over: Partial<TierDraft> = {}): TierDraft => ({ ...emptyTierDraft(), name: 'General', priceText: '15', capacityText: '100', ...over });
const ctx = (over: Partial<{ sold: number; wasPaid: boolean | null }> = {}) => ({ sold: 0, timeZone: TZ, wasPaid: null, ...over });

describe('parsePriceText', () => {
  it.each([
    ['15', 1500],
    ['$15', 1500],
    ['15.5', 1550],
    ['15.50', 1550],
    [' $ 0 ', 0],
    ['1,200', 120000],
  ])('%s → %s', (text, cents) => expect(parsePriceText(text)).toBe(cents));

  it.each(['', 'free', '15.555', '-3', '1.2.3'])('rejects %p', (text) => expect(parsePriceText(text)).toBeNull());
});

describe('priceText', () => {
  it('shows whole dollars without cents', () => {
    expect(priceText(1500)).toBe('15');
    expect(priceText(1550)).toBe('15.50');
    expect(priceText(0)).toBe('0');
  });
});

describe('validateTierDraft', () => {
  it('builds the API body', () => {
    const { errors, body } = validateTierDraft(
      draft({ description: '  Entry after 8  ', maxPerOrderText: '4', salesStart: { date: '2026-10-01', time: '09:00' } }),
      ctx(),
    );
    expect(errors).toEqual({});
    expect(body).toEqual({
      name: 'General',
      description: 'Entry after 8',
      unit_amount: 1500,
      capacity: 100,
      max_per_order: 4,
      sales_start_at: '2026-10-01T16:00:00.000Z',
      sales_end_at: null,
    });
  });

  it.each<[Partial<TierDraft>, Partial<ReturnType<typeof ctx>>, string, string]>([
    [{ name: '  ' }, {}, 'name', 'Name your ticket'],
    [{ priceText: 'ten' }, {}, 'price', 'Enter a price like 15 or 15.00'],
    [{ capacityText: '0' }, {}, 'capacity', 'Capacity must be at least 1'],
    [{ capacityText: '' }, {}, 'capacity', 'Capacity must be at least 1'],
    [{ capacityText: '4' }, { sold: 6 }, 'capacity', '6 already sold, so capacity can’t go lower'],
    [{ priceText: '0' }, { sold: 2, wasPaid: true }, 'price', 'This ticket has sales, so it can’t switch between free and paid'],
    [{ priceText: '5' }, { sold: 2, wasPaid: false }, 'price', 'This ticket has sales, so it can’t switch between free and paid'],
    [{ maxPerOrderText: '0' }, {}, 'maxPerOrder', 'Choose 1 to 20'],
    [{ maxPerOrderText: '21' }, {}, 'maxPerOrder', 'Choose 1 to 20'],
    [
      { salesStart: { date: '2026-10-02', time: '10:00' }, salesEnd: { date: '2026-10-02', time: '10:00' } },
      {},
      'window',
      'Sales must end after they start',
    ],
  ])('%o with %o → %s: %s', (over, c, field, message) => {
    const { errors, body } = validateTierDraft(draft(over), ctx(c));
    expect(errors[field as keyof typeof errors]).toBe(message);
    expect(body).toBeNull();
  });

  it('reads a blank price as free', () => {
    expect(validateTierDraft(draft({ priceText: '  ' }), ctx()).body?.unit_amount).toBe(0);
  });

  it('lets a free ticket without sales become paid', () => {
    expect(validateTierDraft(draft({ priceText: '5' }), ctx({ sold: 0, wasPaid: false })).errors).toEqual({});
  });
});

describe('tierDraftFrom', () => {
  it('round-trips a managed tier', () => {
    const tier = {
      id: 't',
      name: 'VIP',
      description: null,
      unit_amount: 2550,
      currency: 'usd',
      availability: 'on_sale',
      remaining: 10,
      max_quantity: 8,
      sales_start_at: null,
      sales_end_at: '2026-10-10T03:00:00Z',
      capacity: 40,
      sold: 30,
      held: 0,
      checked_in: 0,
      is_active: true,
      max_per_order: 6,
      max_per_user: null,
      sort_order: 1,
    } as ManagedTier;
    expect(tierDraftFrom(tier, TZ)).toEqual({
      name: 'VIP',
      description: '',
      priceText: '25.50',
      capacityText: '40',
      maxPerOrderText: '6',
      salesStart: null,
      salesEnd: { date: '2026-10-09', time: '20:00' },
    });
  });
});
