/** @jest-environment node */

import { NextRequest, NextResponse } from 'next/server';
import { prepareChatMessageWrite } from '@/lib/server/chatMessageWrite';

const mockRequireBearerUser = jest.fn();
const mockAssertChatWritable = jest.fn();
const mockAssertE2eeV2MessageWrite = jest.fn();
const mockAdmin = { from: jest.fn() };

jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: (...args: unknown[]) => mockRequireBearerUser(...args),
  createChatGatekeeperAdmin: () => mockAdmin,
  assertChatWritable: (...args: unknown[]) => mockAssertChatWritable(...args),
}));

jest.mock('@/lib/server/e2eeV2Gate', () => ({
  assertE2eeV2MessageWrite: (...args: unknown[]) => mockAssertE2eeV2MessageWrite(...args),
  assertE2eeV2MediaMessageWrite: () => ({ ok: true }),
  messageBodyV2Field: (body: Record<string, unknown>, snake: string, camel: string) => body[snake] ?? body[camel],
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CHAT_ID = '22222222-2222-4222-8222-222222222222';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_CHAT_ID = '44444444-4444-4444-8444-444444444444';

function request(body: Record<string, unknown>) {
  return new NextRequest('https://click.example/api/chat/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer jwt' },
    body: JSON.stringify(body),
  });
}

/** `connections` then `chats` reads for the connection fallback. */
function fallbackTables() {
  mockAdmin.from.mockImplementation((table: string) => {
    const chain: any = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.limit = jest.fn(() => chain);
    chain.maybeSingle = jest.fn().mockResolvedValue(
      table === 'connections'
        ? { data: { id: CONNECTION_ID, user_ids: [USER_ID, 'peer'], status: 'active' }, error: null }
        : { data: { id: OTHER_CHAT_ID }, error: null },
    );
    return chain;
  });
}

describe('prepareChatMessageWrite: access check and E2EE gate overlap', () => {
  beforeEach(() => {
    mockRequireBearerUser.mockReset().mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: 'jwt' });
    mockAssertChatWritable.mockReset().mockResolvedValue(null);
    mockAssertE2eeV2MessageWrite.mockReset().mockResolvedValue({ ok: true, currentEpoch: null });
    mockAdmin.from.mockReset();
  });

  it('starts the gate before the access check finishes and uses it once', async () => {
    let releaseAccess!: (value: null) => void;
    mockAssertChatWritable.mockImplementation(() => new Promise((resolve) => { releaseAccess = resolve; }));
    const pending = prepareChatMessageWrite(request({ chat_id: CHAT_ID, content: 'hi' }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockAssertE2eeV2MessageWrite).toHaveBeenCalledTimes(1);
    expect(mockAssertE2eeV2MessageWrite.mock.calls[0][1]).toMatchObject({ chatId: CHAT_ID, userId: USER_ID });

    releaseAccess(null);
    const prepared = await pending;
    expect(prepared).not.toBeInstanceOf(NextResponse);
    expect(prepared).toMatchObject({ chatId: CHAT_ID, userId: USER_ID });
    expect(mockAssertE2eeV2MessageWrite).toHaveBeenCalledTimes(1);
  });

  it('returns the access denial even when the early gate fails', async () => {
    mockAssertChatWritable.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    mockAssertE2eeV2MessageWrite.mockRejectedValue(new Error('gate down'));
    const prepared = await prepareChatMessageWrite(request({ chat_id: CHAT_ID, content: 'hi' }));
    expect(prepared).toBeInstanceOf(NextResponse);
    expect((prepared as NextResponse).status).toBe(403);
  });

  it('returns the gate rejection after access passes', async () => {
    mockAssertE2eeV2MessageWrite.mockResolvedValue({ ok: false, response: NextResponse.json({ code: 'E2EE_V2_REQUIRED' }, { status: 409 }) });
    const prepared = await prepareChatMessageWrite(request({ chat_id: CHAT_ID, content: 'hi' }));
    expect((prepared as NextResponse).status).toBe(409);
  });

  it('re-runs the gate for the resolved chat after a connection fallback', async () => {
    mockAssertChatWritable.mockResolvedValue(NextResponse.json({ error: 'Chat not found' }, { status: 404 }));
    fallbackTables();
    const prepared = await prepareChatMessageWrite(
      request({ chat_id: CONNECTION_ID, connection_id: CONNECTION_ID, content: 'hi' }),
    );
    expect(prepared).toMatchObject({ chatId: OTHER_CHAT_ID });
    expect(mockAssertE2eeV2MessageWrite).toHaveBeenCalledTimes(2);
    expect(mockAssertE2eeV2MessageWrite.mock.calls[1][1]).toMatchObject({ chatId: OTHER_CHAT_ID });
  });

  it('runs the gate once, after resolution, when only a connection is given', async () => {
    fallbackTables();
    const prepared = await prepareChatMessageWrite(request({ connection_id: CONNECTION_ID, content: 'hi' }));
    expect(prepared).toMatchObject({ chatId: OTHER_CHAT_ID });
    expect(mockAssertChatWritable).not.toHaveBeenCalled();
    expect(mockAssertE2eeV2MessageWrite).toHaveBeenCalledTimes(1);
  });
});

describe('prepareChatMessageWrite: gated Click Drops', () => {
  const originalPath = `chat/${CHAT_ID}/${USER_ID}/1759312800000-abcdef01-original.jpg`;

  beforeEach(() => {
    mockRequireBearerUser.mockReset().mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: 'jwt' });
    mockAssertChatWritable.mockReset().mockResolvedValue(null);
    mockAssertE2eeV2MessageWrite.mockReset().mockResolvedValue({ ok: true, currentEpoch: null });
  });

  it('moves the original path out of stored metadata', async () => {
    const prepared = await prepareChatMessageWrite(
      request({
        chat_id: CHAT_ID,
        content: '',
        message_type: 'image',
        metadata: { media_url: 'https://signed/preview', disposable_roll: true, drop_original_path: originalPath },
      }),
    );
    expect(prepared).toMatchObject({
      dropOriginalPath: originalPath,
      metadata: { media_url: 'https://signed/preview', disposable_roll: true, drop_gated: true },
    });
    expect((prepared as { metadata: Record<string, unknown> }).metadata).not.toHaveProperty('drop_original_path');
  });

  it("rejects a path in someone else's folder", async () => {
    const prepared = await prepareChatMessageWrite(
      request({
        chat_id: CHAT_ID,
        content: '',
        message_type: 'image',
        metadata: {
          media_url: 'https://signed/preview',
          disposable_roll: true,
          drop_original_path: `chat/${CHAT_ID}/someone-else/1759312800000-abcdef01-original.jpg`,
        },
      }),
    );
    expect((prepared as NextResponse).status).toBe(400);
  });
});
