/** @jest-environment node */

import { NextRequest, NextResponse } from 'next/server';
import { POST } from '@/app/api/chat/attachments/route';

const mockRequireBearerUser = jest.fn();
const mockCreateAdmin = jest.fn();
const mockAssertChatWritable = jest.fn();
const mockAssertE2eeV2MediaUpload = jest.fn();

jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: (...args: unknown[]) => mockRequireBearerUser(...args),
  createChatGatekeeperAdmin: (...args: unknown[]) => mockCreateAdmin(...args),
  assertChatWritable: (...args: unknown[]) => mockAssertChatWritable(...args),
}));

jest.mock('@/lib/server/e2eeV2Gate', () => ({
  assertE2eeV2MediaUpload: (...args: unknown[]) => mockAssertE2eeV2MediaUpload(...args),
  messageBodyV2Field: (
    body: Record<string, unknown>,
    snake: string,
    camel: string,
    metadata?: Record<string, unknown>,
  ) => body[snake] ?? body[camel] ?? metadata?.[snake] ?? metadata?.[camel],
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CHAT_ID = '22222222-2222-4222-8222-222222222222';

function request(body: Record<string, unknown>) {
  return new NextRequest('https://click.example/api/chat/attachments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/chat/attachments', () => {
  const upload = jest.fn();
  const createSignedUrl = jest.fn();
  const getPublicUrl = jest.fn();
  const storageFrom = jest.fn();
  const admin = { storage: { from: storageFrom } };

  beforeEach(() => {
    mockRequireBearerUser.mockReset().mockResolvedValue({ ok: true, user: { id: USER_ID }, bearer: 'jwt' });
    mockCreateAdmin.mockReset().mockReturnValue(admin);
    mockAssertChatWritable.mockReset().mockResolvedValue(null);
    mockAssertE2eeV2MediaUpload.mockReset().mockResolvedValue({ ok: true, currentEpoch: null });
    upload.mockReset().mockResolvedValue({ error: null });
    createSignedUrl.mockReset().mockResolvedValue({ data: { signedUrl: 'https://signed.example/attachment' }, error: null });
    getPublicUrl.mockReset();
    storageFrom.mockReset().mockReturnValue({ upload, createSignedUrl, getPublicUrl });
  });

  it('keeps legacy uploads compatible before an epoch while using private signed URLs', async () => {
    const response = await POST(
      request({
        chat_id: CHAT_ID,
        mime_type: 'application/pdf',
        file_name: 'report.pdf',
        file_b64: 'YQ==',
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      path: expect.stringMatching(new RegExp(`^${CHAT_ID}/${USER_ID}/`)),
      url: 'https://signed.example/attachment',
      ttl_seconds: 3600,
    });
    expect(storageFrom).toHaveBeenCalledWith('chat-attachments');
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('rejects legacy uploads after an epoch before writing ciphertext', async () => {
    mockAssertE2eeV2MediaUpload.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { error: 'E2EE v2 is required for this chat', code: 'E2EE_V2_REQUIRED' },
        { status: 409 },
      ),
    });

    const response = await POST(
      request({
        chat_id: CHAT_ID,
        mime_type: 'application/pdf',
        file_name: 'report.pdf',
        file_b64: 'YQ==',
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'E2EE v2 is required for this chat',
      code: 'E2EE_V2_REQUIRED',
    });
    expect(upload).not.toHaveBeenCalled();
  });
});
