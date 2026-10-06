/**
 * What kind of device a chat device is, never its name: "iPhone", "iPad" (the apps) or
 * "Chrome on Mac" (a browser). Shown when another device is asked to approve it, in
 * Settings › Devices, and in "approve this browser from …" copy.
 */

const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];

/** "Chrome on Mac", from a user-agent string. Null when neither part is recognisable. */
export function browserDeviceLabel(userAgent: string, maxTouchPoints = 0): string | null {
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  let system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  // iPadOS reports itself as a Mac; only touch tells them apart.
  if (system === 'Mac' && maxTouchPoints > 1) system = 'iPad';
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? (system ? `Browser on ${system}` : null);
}

/** This browser's label, or "Web browser" when it can't tell (iOS treats that as a browser too). */
export function thisBrowserDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Web browser';
  return browserDeviceLabel(navigator.userAgent, navigator.maxTouchPoints) ?? 'Web browser';
}

/** True for a browser's label ("Chrome on Mac", "Web browser"), false for an app's ("iPhone"). */
export function isBrowserDeviceLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return / on /.test(label) || /^web browser$/i.test(label);
}

/** True for the apps' phone and tablet labels. */
export function isMobileAppDeviceLabel(label: string | null | undefined): boolean {
  return !!label && !isBrowserDeviceLabel(label) && /iphone|ipad|android|phone|tablet/i.test(label);
}

/**
 * Subject of a "… signed in to your account" sentence: "A new iPhone", "Chrome on Mac",
 * "A new web browser", or "A new device" when an older build didn't say.
 */
export function newSignInSubject(label: string | null | undefined): string {
  if (!label) return 'A new device';
  if (/^web browser$/i.test(label)) return 'A new web browser';
  return isBrowserDeviceLabel(label) ? label : `A new ${label}`;
}
