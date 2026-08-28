import { parseGuestCsv, parseGuestEntries, parseGuestEntry, truncateEmail } from '@/lib/events/guestListParse';
import { sha256HexUtf8 } from '@/lib/connections/priorConnections';
import { applyHashMatches } from '@/lib/events/guestListMatch';
import { generateEventTeasers, isTeaserPushDue, teaserHeadline } from '@/lib/events/eventTeasers';
import { isReconnectEligible, reconnectNudgeCopy, sharedEventNudgeCopy } from '@/lib/cron/nudgesReconnect';

describe('guestListParse', () => {
  it('parses headered CSV emails and instagram handles', () => {
    const rows = parseGuestCsv('email,instagram\nada@click.test,@ada\nbob@click.test,');
    expect(rows).toHaveLength(2);
    expect(rows[0].email).toBe('ada@click.test');
    expect(rows[0].instagram_handle).toBe('ada');
    expect(rows[0].email_hash).toBe(sha256HexUtf8('ada@click.test'));
    expect(rows[1].email).toBe('bob@click.test');
  });

  it('parses newline emails without a header', () => {
    const rows = parseGuestCsv('one@x.test\ntwo@x.test\none@x.test');
    expect(rows.map((r) => r.email)).toEqual(['one@x.test', 'two@x.test']);
  });

  it('rejects empty entries', () => {
    expect(parseGuestEntry({ email: 'not-an-email', instagram_handle: '!!' })).toBeNull();
    expect(parseGuestEntries([{ email: '' }])).toEqual([]);
  });

  it('truncates emails for organizer status', () => {
    expect(truncateEmail('ada@click.test')).toBe('a***@click.test');
  });
});

describe('guestListMatch', () => {
  it('sets exact_email when hash hits', () => {
    const hash = sha256HexUtf8('ada@click.test');
    const matched = applyHashMatches(
      [{ email: 'ada@click.test', instagram_handle: null, email_hash: hash }],
      new Map([[hash, 'user-ada']]),
    );
    expect(matched[0].matched_user_id).toBe('user-ada');
    expect(matched[0].match_confidence).toBe('exact_email');
  });
});

describe('generateEventTeasers', () => {
  it('prefers shared interest and never includes names', () => {
    const teasers = generateEventTeasers({
      profiles: [
        { userId: 'a', ghostMode: false, interestTags: ['Hiking'], groupIds: [] },
        { userId: 'b', ghostMode: false, interestTags: ['hiking', 'Jazz'], groupIds: [] },
        { userId: 'c', ghostMode: false, interestTags: ['Jazz'], groupIds: ['g1'] },
      ],
      connections: [],
    });
    const forA = teasers.find((t) => t.recipient_user_id === 'a');
    expect(forA?.teaser_type).toBe('shared_interest');
    expect(forA?.payload.count).toBe(1);
    expect(JSON.stringify(forA?.payload)).not.toMatch(/b|c|name/i);
    expect(teaserHeadline(forA!.payload)).toMatch(/share your interest in Hiking/);
  });

  it('excludes ghost-mode users from other people\'s counts', () => {
    const teasers = generateEventTeasers({
      profiles: [
        { userId: 'a', ghostMode: false, interestTags: ['Hiking'], groupIds: [] },
        { userId: 'ghost', ghostMode: true, interestTags: ['Hiking'], groupIds: [] },
      ],
      connections: [],
    });
    expect(teasers).toEqual([]);
  });

  it('uses mutual_connection_count only when no interest/org overlap', () => {
    const teasers = generateEventTeasers({
      profiles: [
        { userId: 'a', ghostMode: false, interestTags: [], groupIds: [] },
        { userId: 'b', ghostMode: false, interestTags: [], groupIds: [] },
      ],
      connections: [{ userA: 'a', userB: 'b', active: true }],
    });
    expect(teasers[0]?.teaser_type).toBe('mutual_connection_count');
    expect(teasers[0]?.payload.label).toBe('people you know');
  });
});

describe('isTeaserPushDue', () => {
  const startMs = Date.parse('2026-08-30T18:00:00.000Z');

  it('fires inside the 24–48h window', () => {
    const nowMs = Date.parse('2026-08-28T20:00:00.000Z');
    expect(isTeaserPushDue({ nowMs, startMs, pushSentAt: null })).toBe(true);
  });

  it('skips inside 24h or after send', () => {
    expect(
      isTeaserPushDue({
        nowMs: Date.parse('2026-08-29T20:00:00.000Z'),
        startMs,
        pushSentAt: null,
      }),
    ).toBe(false);
    expect(
      isTeaserPushDue({
        nowMs: Date.parse('2026-08-28T20:00:00.000Z'),
        startMs,
        pushSentAt: '2026-08-28T12:00:00.000Z',
      }),
    ).toBe(false);
  });
});

describe('reconnect eligibility', () => {
  const now = Date.parse('2026-08-28T00:00:00.000Z');
  const encounter = now - 22 * 24 * 60 * 60 * 1000;

  it('requires a 21-day lull after last encounter with no later message', () => {
    expect(
      isReconnectEligible({
        lastEncounterAtMs: encounter,
        lastMessageAtMs: null,
        lastNudgeSentAtMs: null,
        snoozedUntilMs: null,
        nowMs: now,
        source: 'handshake',
        hasEncounter: true,
      }),
    ).toBe(true);
    expect(
      isReconnectEligible({
        lastEncounterAtMs: encounter,
        lastMessageAtMs: encounter + 1000,
        lastNudgeSentAtMs: null,
        snoozedUntilMs: null,
        nowMs: now,
        source: 'handshake',
        hasEncounter: true,
      }),
    ).toBe(false);
  });

  it('respects snooze and cooldown', () => {
    expect(
      isReconnectEligible({
        lastEncounterAtMs: encounter,
        lastMessageAtMs: null,
        lastNudgeSentAtMs: now - 2 * 24 * 60 * 60 * 1000,
        snoozedUntilMs: null,
        nowMs: now,
        source: 'handshake',
        hasEncounter: true,
      }),
    ).toBe(false);
  });

  it('does not auto-generate message text', () => {
    const copy = reconnectNudgeCopy({ peerFirstName: 'Sam', daysSinceEncounter: 21 });
    expect(copy.body).toContain('Sam');
    expect(copy.body.toLowerCase()).not.toContain('hey');
    const shared = sharedEventNudgeCopy({ peerFirstName: 'Sam', eventTitle: 'Picnic' });
    expect(shared.body).toBe('You and Sam are both going to Picnic.');
  });
});
