/** Extract numeric App Store id from a store URL (`…/id1234567890`). */
export function iosAppIdFromStoreUrl(storeUrl: string): string | null {
    const match = storeUrl.trim().match(/\/id(\d+)/);
    return match?.[1] ?? null;
}

/**
 * App configuration — centralizes store URLs and launch state.
 * Set via environment variables; falls back to waitlist mode.
 */
export const APP_CONFIG = {
    ios_store_url: process.env.NEXT_PUBLIC_IOS_STORE_URL || '#waitlist',
    android_store_url: process.env.NEXT_PUBLIC_ANDROID_STORE_URL || '#waitlist',
    app_launched: process.env.NEXT_PUBLIC_APP_LAUNCHED === 'true',
    ios_app_id: iosAppIdFromStoreUrl(process.env.NEXT_PUBLIC_IOS_STORE_URL ?? ''),
} as const;
