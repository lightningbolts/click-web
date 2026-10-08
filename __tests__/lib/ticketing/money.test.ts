import { formatFromPrice, formatMoney } from '@/lib/ticketing/money';

describe('formatMoney', () => {
  it('shows free, whole and fractional amounts', () => {
    expect(formatMoney(0, 'usd')).toBe('Free');
    expect(formatMoney(1500, 'usd')).toBe('$15.00');
    expect(formatMoney(1250, 'usd')).toBe('$12.50');
    expect(formatMoney(130500, 'usd')).toBe('$1,305.00');
  });
});

describe('formatFromPrice', () => {
  it('drops cents on whole amounts', () => {
    expect(formatFromPrice(1200, 'usd')).toBe('$12');
    expect(formatFromPrice(1250, 'usd')).toBe('$12.50');
    expect(formatFromPrice(0, 'usd')).toBe('Free');
  });
});
