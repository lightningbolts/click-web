export const validWaitlistEmails = [
  'terajzhang@gmail.com',
  'ada@example.com',
  'Ada.Lovelace+click@students.example.co.uk',
  "o'connor@example.com",
  'first_last@my-domain.example',
  'person@xn--bcher-kva.de',
  'a'.repeat(64) + '@example.com',
  'a@' + 'b'.repeat(63) + '.com',
  'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(61),
];

export const invalidWaitlistEmails = [
  'made-up-invalid-email',
  '', '   ', 'not-an-email', 'ada@', '@example.com', 'ada@example',
  'ada@@example.com', 'ada lovelace@example.com', 'ada@example .com',
  '.ada@example.com', 'ada.@example.com', 'ada..lovelace@example.com',
  'ada@example..com', 'ada@-example.com', 'ada@example-.com',
  'ada@exam_ple.com', 'ada@example.com.', 'ada@example.c',
  'ada@example.com,grace@example.com', 'Ada <ada@example.com>',
  'ada\n@example.com',
  'a'.repeat(65) + '@example.com',
  'a@' + 'b'.repeat(64) + '.com',
  'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(62),
];
