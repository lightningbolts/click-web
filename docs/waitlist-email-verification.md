# Waitlist email verification

Waitlist signup uses double opt-in. A validly formatted address can request an
email, but is not a confirmed waitlist member until its recipient redeems the
link and clicks **Confirm email**. This proves access to that mailbox at that
time; it cannot guarantee future deliverability or a person's identity.

## Enable in production

1. In Resend, verify a sending domain and create an API key with sending access.
   See [Resend's sending API](https://resend.com/docs/api-reference/emails/send-email).
2. Set server-only Worker secrets `RESEND_API_KEY` and `WAITLIST_EMAIL_FROM`
   (for example, `Click <waitlist@your-verified-domain.com>`). Do not put these
   values in `NEXT_PUBLIC_*` variables or commit them.
3. Set `WAITLIST_VERIFICATION_BASE_URL` to the public HTTPS site origin, or use
   the existing `NEXT_PUBLIC_BASE_URL`. The code never trusts the request Host
   header for email links. Use `http://localhost:3000` for local development.
4. Apply `20260916000000_waitlist_email_verification.sql` through the normal
   Supabase migration process before deploying the app update. The migration
   adds the optional attribution columns on older installations too.
5. Deploy the app and test a real inbox: submit an address, see **Check your
   inbox**, open the newest message, click **Confirm email**, and verify the
   corresponding waitlist row has `verified_at`. Request and verify a link a
   second time to exercise the duplicate/replay handling.

Configure the migration, secrets, and app as one release. Missing configuration,
missing database functions, or email-provider failures return a retryable error;
the app never falls back to accepting an unverified address. Resend is used only
for waitlist confirmation. Supabase login, password reset, auth callbacks, and
other existing functionality continue to use their existing code paths.

## Data and behavior

- `waitlist_verifications` contains pending addresses and SHA-256 token hashes.
  Tokens contain 256 random bits, expire after 24 hours, and can be redeemed once.
  The raw token appears only in the email and confirmation POST, never in API
  responses or database records. Links put it in a URL fragment, which the
  confirmation page removes from the address bar.
- Viewing the page does not redeem a token. The explicit POST prevents ordinary
  link-prefetching email scanners from accidentally confirming signups.
- Only successful confirmation inserts a new `waitlist` row. Existing rows are
  preserved with `verified_at = NULL` until confirmed; the admin waitlist count
  includes only verified rows. Existing source/referral information is retained.
  Existing legacy rows are not automatically emailed. Any exports or campaigns
  outside this app must likewise filter `verified_at IS NOT NULL`.
- The database enforces a two-minute resend cooldown and five attempts per email
  per 24-hour window, shared across Workers. Email keys are case-insensitive.
  Resending replaces the previous link. Provider failures still consume a send
  attempt; the user can retry after the cooldown.
- Signup also uses the existing 10/minute Cloudflare rate-limit binding with a
  separate `waitlist:` key, leaving connection request counters independent.
  Local development uses the existing process-memory rate-limit fallback.
- Anonymous/authenticated clients cannot write directly to the waitlist, access
  pending tokens, or call the confirmation database function. These actions
  require the server's service-role client.
- New, throttled, and already-confirmed requests share the same pending response
  to avoid disclosing membership. A successful provider response is not treated
  as proof of delivery or mailbox ownership.

## Tests

Run `npm test -- --runInBand`, `npm run typecheck`, `npm run lint`, and
`npm run build` using the normal project toolchain.

The waitlist suites exercise format validation, both marketing entry points,
referral signup, pending messages, resend, provider failures, token handling,
confirmation-page interaction, and retry behavior. Resend calls are mocked: no
real messages are sent. Tests retain `terajzhang@gmail.com` as the requested
valid-format example and include a fabricated but well-formatted mailbox that
must remain pending.

For database behavior, run `scripts/test-waitlist-verification.sql` against an
isolated local database after applying the migration. It checks expiration,
replay, quotas, attribution, legacy records, and bypass permissions, and rolls
back its fixtures. Do not run this fixture script against production.

Pending records can be periodically removed after `expires_at` is more than
seven days old; do not delete live records to reset sending quotas.
