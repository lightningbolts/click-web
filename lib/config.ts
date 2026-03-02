/**
 * App configuration — centralizes store URLs and launch state.
 * Set via environment variables; falls back to waitlist mode.
 */
export const APP_CONFIG = {
    ios_store_url: process.env.NEXT_PUBLIC_IOS_STORE_URL || '#waitlist',
    android_store_url: process.env.NEXT_PUBLIC_ANDROID_STORE_URL || '#waitlist',
    app_launched: process.env.NEXT_PUBLIC_APP_LAUNCHED === 'true',
} as const;
