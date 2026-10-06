/** Cookie the signed-in shell writes so server-rendered "today" and greetings use local time. */
export const TIME_ZONE_COOKIE = 'click_tz';

export function validTimeZone(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 64) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw });
    return raw;
  } catch {
    return null;
  }
}
