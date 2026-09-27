import { chatGifFromMessage, gifMessageMetadata, isKlipyMediaUrl } from '@/lib/chat/gif';
import { klipySendRendition, klipyPreviewRendition, type KlipyGifItem } from '@/lib/chat/klipy';
import { previewLabelForMessage } from '@/lib/chat/mediaMetadata';

const URL_MD = 'https://static.klipy.com/ii/935d/14/af/JUYsGsrc.webp';

describe('isKlipyMediaUrl', () => {
  it('accepts KLIPY static hosts over https', () => {
    expect(isKlipyMediaUrl(URL_MD)).toBe(true);
    expect(isKlipyMediaUrl('https://static2.klipy.com/a.gif')).toBe(true);
  });

  it('rejects other hosts, http, and text around the URL', () => {
    expect(isKlipyMediaUrl('http://static.klipy.com/a.gif')).toBe(false);
    expect(isKlipyMediaUrl('https://static.klipy.com.evil.com/a.gif')).toBe(false);
    expect(isKlipyMediaUrl('https://api.klipy.com/a.gif')).toBe(false);
    expect(isKlipyMediaUrl(`look ${URL_MD}`)).toBe(false);
    expect(isKlipyMediaUrl('')).toBe(false);
  });
});

describe('chatGifFromMessage', () => {
  const metadata = gifMessageMetadata({ provider: 'klipy', width: 498, height: 280 });

  it('reads a decrypted GIF message', () => {
    expect(chatGifFromMessage({ message_type: 'text', content: URL_MD, metadata })).toEqual({
      provider: 'klipy',
      width: 498,
      height: 280,
      url: URL_MD,
    });
  });

  it('needs both the metadata marker and a KLIPY body', () => {
    expect(chatGifFromMessage({ message_type: 'text', content: URL_MD, metadata: {} })).toBeNull();
    expect(
      chatGifFromMessage({ message_type: 'text', content: 'https://example.com/x.gif', metadata }),
    ).toBeNull();
    // Still-encrypted body (not yet decrypted) is not a GIF.
    expect(chatGifFromMessage({ message_type: 'text', content: 'e2e2:abc', metadata })).toBeNull();
    expect(chatGifFromMessage({ message_type: 'image', content: URL_MD, metadata })).toBeNull();
  });
});

describe('KLIPY renditions', () => {
  const item: KlipyGifItem = {
    id: 1,
    slug: 'hello',
    file: {
      md: {
        gif: { url: 'https://static.klipy.com/md.gif', width: 498, height: 498 },
        webp: { url: 'https://static.klipy.com/md.webp', width: 498, height: 498 },
      },
      sm: { gif: { url: 'https://static.klipy.com/sm.gif', width: 220, height: 220 } },
    },
  };

  it('prefers WebP and the right size tier', () => {
    expect(klipySendRendition(item)?.url).toBe('https://static.klipy.com/md.webp');
    expect(klipyPreviewRendition(item)?.url).toBe('https://static.klipy.com/sm.gif');
  });

  it('returns null when nothing usable is present', () => {
    expect(klipySendRendition({ id: 2, slug: 'x' })).toBeNull();
  });
});

describe('previewLabelForMessage', () => {
  it('labels GIF messages instead of showing the URL', () => {
    expect(previewLabelForMessage({ message_type: 'text', content: URL_MD })).toBe('GIF');
  });
});
