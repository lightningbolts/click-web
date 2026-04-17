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
