import { z } from 'zod';

export const WAITLIST_EMAIL_ERROR = 'Enter a valid email address.';

// Share the API's email-format policy with every waitlist form. This validates
// syntax only; it does not claim that the mailbox exists or belongs to the user.
export const waitlistEmailSchema = z.string()
  .trim()
  .max(254, WAITLIST_EMAIL_ERROR)
  .email(WAITLIST_EMAIL_ERROR)
  .refine((email) => {
    const [local, domain] = email.split('@');
    return local.length <= 64 && !!domain && domain.split('.').every((label) =>
      label.length <= 63 && !label.startsWith('-') && !label.endsWith('-'),
    );
  }, WAITLIST_EMAIL_ERROR);
