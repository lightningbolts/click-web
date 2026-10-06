import { clicksHref, filterForThread, parseClicksFilter, parseClicksThread } from '@/lib/clicks/route';

describe('clicks routing', () => {
  it('parses filters with an Active default', () => {
    expect(parseClicksFilter('hubs')).toBe('hubs');
    expect(parseClicksFilter('nope')).toBe('active');
    expect(parseClicksFilter(null)).toBe('active');
  });

  it('parses thread paths', () => {
    expect(parseClicksThread('/clicks')).toBeNull();
    expect(parseClicksThread('/clicks/c/abc-1')).toEqual({ kind: 'c', id: 'abc-1' });
    expect(parseClicksThread('/clicks/g/g%201')).toEqual({ kind: 'g', id: 'g 1' });
    expect(parseClicksThread('/clicks/h/x/extra')).toEqual({ kind: 'h', id: 'x' });
    expect(parseClicksThread('/clicks/z/x')).toBeNull();
    expect(parseClicksThread('/clicks/c/%E0%A4%A')).toBeNull();
  });

  it('builds inbox hrefs', () => {
    expect(clicksHref('active')).toBe('/clicks');
    expect(clicksHref('archived')).toBe('/clicks?filter=archived');
  });

  it('maps threads to their filter', () => {
    expect(filterForThread({ kind: 'g', id: '1' }, false)).toBe('groups');
    expect(filterForThread({ kind: 'h', id: '1' }, false)).toBe('hubs');
    expect(filterForThread({ kind: 'c', id: '1' }, true)).toBe('archived');
    expect(filterForThread(null, false)).toBeNull();
  });
});
