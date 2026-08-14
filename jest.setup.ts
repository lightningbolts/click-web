import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'node:util';

// jsdom doesn't expose TextEncoder / TextDecoder by default under jest-environment-jsdom.
if (typeof (globalThis as unknown as { TextEncoder?: unknown }).TextEncoder === 'undefined') {
  (globalThis as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
}
if (typeof (globalThis as unknown as { TextDecoder?: unknown }).TextDecoder === 'undefined') {
  (globalThis as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;
}

// jsdom does not expose Node's webcrypto; attach it so tests that need
// `crypto.subtle` (chat E2EE + attachment crypto) work under jest-environment-jsdom.
import { webcrypto as nodeWebCrypto } from 'node:crypto';
if (!(globalThis as unknown as { crypto?: unknown }).crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: nodeWebCrypto,
    configurable: true,
  });
} else if (!(globalThis.crypto as { subtle?: unknown }).subtle) {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    value: (nodeWebCrypto as { subtle: unknown }).subtle,
    configurable: true,
  });
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

jest.mock('maplibre-gl', () => {
  const map = {
    addControl: jest.fn(),
    on: jest.fn((event: string, cb: () => void) => {
      if (event === 'load') cb();
    }),
    once: jest.fn((event: string, cb: () => void) => {
      if (event === 'idle' || event === 'style.load') cb();
    }),
    addSource: jest.fn(),
    addLayer: jest.fn(),
    getSource: jest.fn(() => ({ setData: jest.fn() })),
    getLayer: jest.fn(() => true),
    setLayoutProperty: jest.fn(),
    setPaintProperty: jest.fn(),
    setStyle: jest.fn(),
    getCenter: jest.fn(() => ({ lng: -122.3085, lat: 47.6554 })),
    getZoom: jest.fn(() => 14.2),
    jumpTo: jest.fn(),
    fitBounds: jest.fn(),
    resize: jest.fn(),
    remove: jest.fn(),
    getCanvas: jest.fn(() => ({ style: {} })),
    project: jest.fn(() => ({ x: 140, y: 220 })),
  };
  return {
    __esModule: true,
    default: {
      Map: jest.fn(() => map),
      NavigationControl: jest.fn(),
      Marker: jest.fn().mockImplementation(({ element }: { element?: HTMLElement } = {}) => {
        const el = element ?? document.createElement('div');
        const api: {
          setLngLat: jest.Mock;
          addTo: jest.Mock;
          remove: jest.Mock;
          getElement: jest.Mock;
        } = {
          setLngLat: jest.fn(),
          addTo: jest.fn(),
          remove: jest.fn(),
          getElement: jest.fn(() => el),
        };
        api.setLngLat.mockReturnValue(api);
        api.addTo.mockImplementation(() => {
          document.body.appendChild(el);
          return api;
        });
        api.remove.mockImplementation(() => {
          el.remove();
        });
        return api;
      }),
      Popup: jest.fn().mockImplementation(() => {
        const host = document.createElement('div');
        const api: {
          setLngLat: jest.Mock;
          setHTML: jest.Mock;
          addTo: jest.Mock;
          remove: jest.Mock;
        } = {
          setLngLat: jest.fn(),
          setHTML: jest.fn(),
          addTo: jest.fn(),
          remove: jest.fn(),
        };
        api.setLngLat.mockReturnValue(api);
        api.setHTML.mockImplementation((html: string) => {
          host.innerHTML = html;
          return api;
        });
        api.addTo.mockImplementation(() => {
          document.body.appendChild(host);
          return api;
        });
        api.remove.mockImplementation(() => {
          host.remove();
        });
        return api;
      }),
      LngLatBounds: jest.fn().mockImplementation(() => ({
        extend: jest.fn().mockReturnThis(),
      })),
    },
  };
});

