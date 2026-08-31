import { pluralize } from '@/lib/format/pluralize';

describe('pluralize', () => {
  it('uses singular form for count 1', () => {
    expect(pluralize(1, 'connection')).toBe('1 connection');
    expect(pluralize(1, 'new connection')).toBe('1 new connection');
  });

  it('uses plural form for other counts', () => {
    expect(pluralize(0, 'connection')).toBe('0 connections');
    expect(pluralize(2, 'connection')).toBe('2 connections');
    expect(pluralize(2, 'time', 'times')).toBe('2 times');
  });
});
