import 'server-only';

export const WAITLIST_PENDING_MESSAGE = 'Check your inbox for a confirmation link. Your place is confirmed only after you verify your email. If you already confirmed, you do not need to do anything else.';

export function verificationEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.WAITLIST_EMAIL_FROM?.trim();
  const baseUrl = process.env.WAITLIST_VERIFICATION_BASE_URL?.trim() || process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (!apiKey || !from || !baseUrl) throw new Error('Waitlist email is not configured');
  const url = new URL(baseUrl);
  if (url.username || url.password || (url.protocol !== 'https:' &&
      !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new Error('Invalid verification origin');
  }
  return { apiKey, from, origin: url.origin };
}

export function newVerificationToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashVerificationToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sendVerificationEmail(
  email: string, token: string, tokenHash: string,
  config: ReturnType<typeof verificationEmailConfig>,
) {
  // Fragments are not sent to the page server, request logs, or Referrer headers.
  const link = `${config.origin}/waitlist/verify#token=${token}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `waitlist-${tokenHash}`,
    },
    body: JSON.stringify({
      from: config.from, to: [email], subject: 'Confirm your Click waitlist email',
      text: `Confirm your email to join the Click waitlist:\n\n${link}\n\nThis link expires in 24 hours and can be used once. If you did not request this, ignore this email.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Verification email delivery failed');
  const data = await response.json();
  if (typeof data.id !== 'string' || !data.id) throw new Error('Email provider did not accept the message');
}
