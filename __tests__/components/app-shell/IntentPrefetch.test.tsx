/* eslint-disable @next/next/no-html-link-for-pages -- plain <a> on purpose: the listener must cover them too. */
import { act, fireEvent, render } from '@testing-library/react';
import { IntentPrefetch, prefetchTarget } from '@/components/app-shell/IntentPrefetch';

const prefetch = jest.fn();

// jsdom has no PointerEvent, so `pointerType` would be lost.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? '';
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}
jest.mock('next/navigation', () => ({ useRouter: () => ({ prefetch }) }));

const here = { href: 'https://joinclick.co/events', origin: 'https://joinclick.co', pathname: '/events', search: '' };

function anchor(href: string, attrs: Record<string, string> = {}) {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  return a;
}

describe('prefetchTarget', () => {
  it('returns the in-app path for page links', () => {
    expect(prefetchTarget(anchor('/e/abc'), here)).toBe('/e/abc');
    expect(prefetchTarget(anchor('/clicks?filter=hubs'), here)).toBe('/clicks?filter=hubs');
    expect(prefetchTarget(anchor('https://joinclick.co/map'), here)).toBe('/map');
  });

  it.each([
    ['another origin', anchor('https://calendar.google.com/x')],
    ['a new tab', anchor('/e/abc', { target: '_blank' })],
    ['a download', anchor('/e/abc/calendar.ics', { download: '' })],
    ['a file', anchor('/e/abc/calendar.ics')],
    ['an API route', anchor('/api/connections')],
    ['an auth route', anchor('/auth/callback')],
    ['the current page', anchor('/events')],
    ['a hash link', anchor('#top')],
    ['an app deep link', anchor('click://p/x')],
    ['an opted-out link', anchor('/e/abc', { 'data-no-prefetch': '' })],
  ])('skips %s', (_label, a) => {
    expect(prefetchTarget(a, here)).toBeNull();
  });
});

describe('IntentPrefetch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    prefetch.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  function setup() {
    const view = render(
      <>
        <IntentPrefetch />
        <a href="/e/abc">
          <span>Run Club</span>
        </a>
        <a href="/map">Map</a>
      </>,
    );
    return { link: view.getByText('Run Club'), map: view.getByText('Map') };
  }

  it('full-prefetches after a short hover', () => {
    const { link } = setup();
    fireEvent.pointerOver(link, { pointerType: 'mouse' });
    expect(prefetch).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(60));
    expect(prefetch).toHaveBeenCalledWith('/e/abc', { kind: 'full' });
  });

  it('ignores links the pointer only crosses', () => {
    const { link, map } = setup();
    fireEvent.pointerOver(link, { pointerType: 'mouse' });
    act(() => jest.advanceTimersByTime(20));
    fireEvent.pointerOver(map, { pointerType: 'mouse' });
    act(() => jest.advanceTimersByTime(60));
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith('/map', { kind: 'full' });
  });

  it('prefetches at once on touch and only once per URL', () => {
    const { link } = setup();
    fireEvent.pointerDown(link, { pointerType: 'touch' });
    fireEvent.pointerDown(link, { pointerType: 'touch' });
    expect(prefetch).toHaveBeenCalledTimes(1);
  });
});
