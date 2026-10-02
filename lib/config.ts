/** Extract numeric App Store id from a store URL (`…/id1234567890`). */
export function iosAppIdFromStoreUrl(storeUrl: string): string | null {
    const match = storeUrl.trim().match(/\/id(\d+)/);
    return match?.[1] ?? null;
}

/**
 * App configuration — centralizes store URLs and launch state.
 * Set via environment variables; falls back to waitlist mode.
 */
/** Public TestFlight invite for the iOS beta. */
export const IOS_TESTFLIGHT_URL = 'https://testflight.apple.com/join/XmYMsK8e';

export const APP_CONFIG = {
    ios_store_url: process.env.NEXT_PUBLIC_IOS_STORE_URL || IOS_TESTFLIGHT_URL,
    ios_testflight_url: IOS_TESTFLIGHT_URL,
    android_store_url: process.env.NEXT_PUBLIC_ANDROID_STORE_URL || '#waitlist',
    app_launched: process.env.NEXT_PUBLIC_APP_LAUNCHED === 'true',
    ios_app_id: iosAppIdFromStoreUrl(process.env.NEXT_PUBLIC_IOS_STORE_URL ?? ''),
    /** Click for Business / Click Places pilot contact. */
    business_contact_email: process.env.NEXT_PUBLIC_BUSINESS_CONTACT_EMAIL || 'mepsht@uw.edu',
} as const;
