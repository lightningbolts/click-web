import { approverPlace, describe as describeNotice } from '@/components/chat/useE2eeNotice';

const pending = { status: 'pending' as const, expired: false, email_sent: false };

describe('approverPlace', () => {
  it('prefers a phone, then a named browser, then a neutral fallback', () => {
    expect(approverPlace([{ label: 'Chrome on Mac', last_seen_at: null }, { label: 'iPhone', last_seen_at: null }])).toBe('from your iPhone');
    expect(approverPlace([{ label: 'Chrome on Mac', last_seen_at: null }])).toBe('from Chrome on your Mac');
    expect(approverPlace([{ label: 'Web browser', last_seen_at: null }])).toBe('from the other browser you use Click in');
    expect(approverPlace([{ label: null, last_seen_at: null }])).toBe('from a device you already use Click on');
  });
});

describe('e2ee notice', () => {
  const chatId = 'chat-1';

  it('is quiet when everything here is readable', () => {
    expect(describeNotice({ chatId, state: { kind: 'checked', canRead: true, approval: null }, hasLockedMessages: false })).toBeNull();
  });

  it('says where to approve a web-only account’s new browser, and keeps checking', () => {
    const view = describeNotice({
      chatId,
      state: { kind: 'checked', canRead: false, approval: { own: pending, approvers: [{ label: 'Chrome on Mac', last_seen_at: null }] } },
      hasLockedMessages: true,
    });
    expect(view?.text).toBe('To see earlier messages here, approve this browser from Chrome on your Mac.');
    expect(view?.text).not.toMatch(/phone/i);
    expect(view?.waiting).toBe(true);
  });

  it('mentions the emailed link once it was sent', () => {
    const view = describeNotice({
      chatId,
      state: { kind: 'checked', canRead: false, approval: { own: { ...pending, email_sent: true }, approvers: [{ label: 'iPhone', last_seen_at: null }] } },
      hasLockedMessages: true,
    });
    expect(view?.text).toBe('To see earlier messages here, approve this browser from your iPhone, or open the link we emailed you.');
  });

  it('explains, dismissibly, when there is no other device to ask', () => {
    const view = describeNotice({
      chatId,
      state: { kind: 'checked', canRead: false, approval: { own: null, approvers: [] } },
      hasLockedMessages: true,
    });
    expect(view?.action).toBe('dismiss');
    expect(view?.waiting).toBe(false);
    expect(view?.lockedText).toBe('Not available in this browser');
  });

  it('flags older unreadable messages even after this browser can read new ones', () => {
    const view = describeNotice({
      chatId,
      state: { kind: 'checked', canRead: true, approval: { own: { ...pending, status: 'approved' }, approvers: [{ label: 'iPhone', last_seen_at: null }] } },
      hasLockedMessages: true,
    });
    expect(view?.key).toBe('device-approved');
    expect(view?.waiting).toBe(true);
  });
});
