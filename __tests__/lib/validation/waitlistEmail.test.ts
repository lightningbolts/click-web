import { waitlistEmailSchema } from '@/lib/validation/waitlistEmail';
import { waitlistBodySchema } from '@/lib/api/schemas/user';
import { validWaitlistEmails, invalidWaitlistEmails } from '../../helpers/waitlistEmails';

describe('waitlist email validation', () => {
  it.each(validWaitlistEmails)('accepts %s without changing case or aliases', (email) => {
    expect(waitlistEmailSchema.parse(email)).toBe(email);
    expect(waitlistBodySchema.parse({ email }).email).toBe(email);
  });

  it.each(invalidWaitlistEmails)('rejects %s in both the form and API schema', (email) => {
    expect(waitlistEmailSchema.safeParse(email).success).toBe(false);
    expect(waitlistBodySchema.safeParse({ email }).success).toBe(false);
  });

  it.each([null, undefined, 123, [], {}, true])('rejects non-string input %p', (email) => {
    expect(waitlistEmailSchema.safeParse(email).success).toBe(false);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(waitlistEmailSchema.parse('  Ada+click@example.com  ')).toBe('Ada+click@example.com');
  });
});
