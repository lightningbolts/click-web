/**
 * @jest-environment node
 */

import { normalizeLiveKitWsUrl, readLiveKitEnv } from '@/lib/server/livekitEnv';

describe('normalizeLiveKitWsUrl', () => {
  it('leaves wss and ws URLs unchanged', () => {
    expect(normalizeLiveKitWsUrl('wss://click-7e741h6f.livekit.cloud')).toBe( // pragma: allowlist secret
      'wss://click-7e741h6f.livekit.cloud', // pragma: allowlist secret
    );
    expect(normalizeLiveKitWsUrl('ws://localhost:7880')).toBe('ws://localhost:7880');
  });

  it('converts https/http to wss/ws', () => {
    expect(normalizeLiveKitWsUrl('https://click-7e741h6f.livekit.cloud')).toBe( // pragma: allowlist secret
      'wss://click-7e741h6f.livekit.cloud', // pragma: allowlist secret
    );
    expect(normalizeLiveKitWsUrl('http://127.0.0.1:7880')).toBe('ws://127.0.0.1:7880');
  });

  it('prefixes LiveKit Cloud hostnames copied from the dashboard', () => {
    expect(normalizeLiveKitWsUrl('click-7e741h6f.livekit.cloud')).toBe( // pragma: allowlist secret
      'wss://click-7e741h6f.livekit.cloud', // pragma: allowlist secret
    );
  });
});

describe('readLiveKitEnv', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
    jest.resetModules();
  });

  it('accepts LIVEKIT_URL when LIVEKIT_WS_URL is unset', async () => {
    delete process.env.LIVEKIT_WS_URL;
    process.env.LIVEKIT_API_KEY = 'key';
    process.env.LIVEKIT_API_SECRET = 'secret';
    process.env.LIVEKIT_URL = 'click-7e741h6f.livekit.cloud'; // pragma: allowlist secret
    const { readLiveKitEnv: read } = await import('@/lib/server/livekitEnv');
    expect(read()).toEqual({
      apiKey: 'key',
      apiSecret: 'secret',
      wsUrl: 'wss://click-7e741h6f.livekit.cloud', // pragma: allowlist secret
    });
  });

  it('returns null when any credential is missing', () => {
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_WS_URL;
    delete process.env.LIVEKIT_URL;
    expect(readLiveKitEnv()).toBeNull();
  });
});
