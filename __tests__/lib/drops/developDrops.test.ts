/** @jest-environment node */

jest.mock('server-only', () => ({}));

const mockAssertChatWritable = jest.fn();
jest.mock('@/lib/server/chatGatekeeper', () => ({
  assertChatWritable: (...args: unknown[]) => mockAssertChatWritable(...args),
}));

import { makeSupabaseMock, expectFilter } from '../../helpers/supabaseRouteMocks';
import { developDrops } from '@/lib/server/drops/develop';
import { extractGatedChatDrop } from '@/lib/server/drops/chatDrops';
import { isOwnedDropPath } from '@/lib/server/drops/storage';

const VIEWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHAT = '11111111-1111-4111-8111-111111111111';
const OTHER_CHAT = '22222222-2222-4222-8222-222222222222';
const READY = '33333333-3333-4333-8333-333333333333';
const PENDING = '44444444-4444-4444-8444-444444444444';
const LEGACY = '55555555-5555-4555-8555-555555555555';
const FOREIGN = '66666666-6666-4666-8666-666666666666';
const NOW = Date.parse('2026-10-02T12:00:00Z');
const PAST = '2026-10-02T10:00:00.000Z';
const FUTURE = '2026-10-03T10:00:00.000Z';
const READY_PATH = `chat/${CHAT}/${VIEWER}/1759312800000-abcdef01-original.jpg`;
const PENDING_PATH = `chat/${CHAT}/${VIEWER}/1759312800001-abcdef02-original.jpg`;

function setup() {
  const mock = makeSupabaseMock({
    tables: {
      messages: {
        data: [
          { id: READY, chat_id: CHAT, metadata: { disposable_roll: true, drop_gated: true, reveal_at: PAST } },
          { id: PENDING, chat_id: CHAT, metadata: { disposable_roll: true, drop_gated: true, reveal_at: FUTURE } },
          { id: LEGACY, chat_id: CHAT, metadata: { disposable_roll: true, collaboration_ttl: PAST } },
          { id: FOREIGN, chat_id: OTHER_CHAT, metadata: { disposable_roll: true, reveal_at: PAST } },
        ],
        error: null,
      },
      chat_drop_originals: {
        data: [
          { message_id: READY, object_path: READY_PATH, reveal_at: PAST },
          { message_id: PENDING, object_path: PENDING_PATH, reveal_at: FUTURE },
        ],
        error: null,
      },
      drop_views: {
        data: [
          { drop_kind: 'chat', drop_id: READY, developed_at: '2026-10-02T11:00:00.000Z' },
          { drop_kind: 'chat', drop_id: LEGACY, developed_at: '2026-10-02T11:30:00.000Z' },
        ],
        error: null,
      },
    },
  });
  const createSignedUrls = jest.fn(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })),
    error: null,
  }));
  const admin = { ...mock.supabase, storage: { from: jest.fn(() => ({ createSignedUrls })) } };
  mockAssertChatWritable.mockImplementation(async (_admin: unknown, _user: string, chatId: string) =>
    chatId === CHAT ? null : { status: 403 },
  );
  return { mock, admin, createSignedUrls };
}

describe('developDrops', () => {
  it('develops ready drops, signs only their gated originals, and keeps pending ones pending', async () => {
    const { mock, admin, createSignedUrls } = setup();
    const results = await developDrops(
      admin as never,
      VIEWER,
      [
        { kind: 'chat', id: READY },
        { kind: 'chat', id: PENDING },
        { kind: 'chat', id: LEGACY },
        { kind: 'chat', id: FOREIGN },
      ],
      NOW,
    );

    expect(results).toEqual([
      { kind: 'chat', id: READY, status: 'developed', developed_at: '2026-10-02T11:00:00.000Z', url: `https://signed/${READY_PATH}` },
      { kind: 'chat', id: PENDING, status: 'pending', reveal_at: FUTURE },
      { kind: 'chat', id: LEGACY, status: 'developed', developed_at: '2026-10-02T11:30:00.000Z', url: null },
      { kind: 'chat', id: FOREIGN, status: 'not_found' },
    ]);
    // The pending original is never signed.
    expect(createSignedUrls).toHaveBeenCalledWith([READY_PATH], 600);
    const upserted = mock.builder('drop_views').upsert.mock.calls[0][0] as Array<{ drop_id: string }>;
    expect(upserted.map((r) => r.drop_id)).toEqual([READY, LEGACY]);
    expectFilter(mock.builder('drop_views'), 'viewer_id', VIEWER);
  });

  it('reports unsupported kinds as not found without touching storage', async () => {
    const { admin, createSignedUrls } = setup();
    const results = await developDrops(admin as never, VIEWER, [{ kind: 'event', id: READY }], NOW);
    expect(results).toEqual([{ kind: 'event', id: READY, status: 'not_found' }]);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
});

describe('extractGatedChatDrop', () => {
  const base = { messageType: 'image', chatId: CHAT, userId: VIEWER };

  it('moves an owned original path out of the stored metadata', () => {
    const result = extractGatedChatDrop({
      ...base,
      metadata: { disposable_roll: true, drop_original_path: READY_PATH, media_path: 'x' },
    });
    expect(result).toEqual({
      metadata: { disposable_roll: true, drop_gated: true, media_path: 'x' },
      originalPath: READY_PATH,
    });
  });

  it('passes ordinary messages through untouched', () => {
    const metadata = { disposable_roll: true };
    expect(extractGatedChatDrop({ ...base, metadata })).toEqual({ metadata, originalPath: null });
  });

  it("rejects another user's or chat's path, traversal, and non-drop messages", () => {
    const other = `chat/${OTHER_CHAT}/${VIEWER}/1759312800000-abcdef01-original.jpg`;
    for (const drop_original_path of [other, `${READY_PATH}/../x`, 'chat/../../secret', 42]) {
      expect(
        extractGatedChatDrop({ ...base, metadata: { disposable_roll: true, drop_original_path } }),
      ).toHaveProperty('error');
    }
    expect(
      extractGatedChatDrop({ ...base, metadata: { drop_original_path: READY_PATH } }),
    ).toHaveProperty('error');
    expect(
      extractGatedChatDrop({ ...base, messageType: 'text', metadata: { disposable_roll: true, drop_original_path: READY_PATH } }),
    ).toHaveProperty('error');
  });
});

describe('isOwnedDropPath', () => {
  it('accepts exactly one generated file name under the prefix', () => {
    const prefix = `chat/${CHAT}/${VIEWER}/`;
    expect(isOwnedDropPath(READY_PATH, prefix)).toBe(true);
    expect(isOwnedDropPath(`${prefix}nested/1759312800000-abcdef01-original.jpg`, prefix)).toBe(false);
    expect(isOwnedDropPath(`${prefix}1759312800000-abcdef01-original.exe`, prefix)).toBe(false);
  });
});
