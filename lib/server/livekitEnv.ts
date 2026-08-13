import 'server-only';

import { runtimeEnv } from '@/lib/server/runtimeEnv';

export type LiveKitRuntimeEnv = {
  apiKey: string;
  apiSecret: string;
  wsUrl: string;
};

/**
 * LiveKit Cloud dashboard copies a hostname (`click-….livekit.cloud`) without a scheme.
 * The client SDK needs `wss://`. Local self-host often uses `ws://` / `http://`.
 */
export function normalizeLiveKitWsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^wss?:\/\//i.test(trimmed)) return trimmed;
  if (/^https:\/\//i.test(trimmed)) {
    return `wss://${trimmed.slice('https://'.length)}`;
  }
  if (/^http:\/\//i.test(trimmed)) {
    return `ws://${trimmed.slice('http://'.length)}`;
  }
  return `wss://${trimmed}`;
}

/**
 * Resolve LiveKit credentials the same way other Cloudflare-sensitive secrets do
 * (`runtimeEnv` → static process.env, dynamic process.env, OpenNext context, workers env).
 */
export function readLiveKitEnv(): LiveKitRuntimeEnv | null {
  const apiKey = runtimeEnv('LIVEKIT_API_KEY');
  const apiSecret = runtimeEnv('LIVEKIT_API_SECRET');
  const rawUrl = runtimeEnv('LIVEKIT_WS_URL') || runtimeEnv('LIVEKIT_URL');
  if (!apiKey || !apiSecret || !rawUrl) return null;
  const wsUrl = normalizeLiveKitWsUrl(rawUrl);
  if (!wsUrl) return null;
  return { apiKey, apiSecret, wsUrl };
}
