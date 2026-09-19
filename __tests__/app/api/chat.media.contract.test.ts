/** @jest-environment node */

import { CHAT_MEDIA_MIME_TYPES, MAX_MEDIA_BYTES } from '@/app/api/chat/media/route';

describe('/api/chat/media contract', () => {
  it('accepts the voice-note MIME emitted by both mobile platforms', () => {
    expect(CHAT_MEDIA_MIME_TYPES.has('audio/mp4')).toBe(true);
  });

  it('keeps arbitrary document attachments out of the media route', () => {
    expect(CHAT_MEDIA_MIME_TYPES.has('application/pdf')).toBe(false);
    expect(CHAT_MEDIA_MIME_TYPES.has('application/octet-stream')).toBe(false);
  });

  it('matches the 25 MiB encrypted media storage ceiling', () => {
    expect(MAX_MEDIA_BYTES).toBe(25 * 1024 * 1024);
  });
});
