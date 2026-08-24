import {
  extensionFromMime,
  extractLinks,
  formatFileSize,
  mapFilesFromRow,
  mapMediaFromRow,
  maskEncryptedSnippet,
  mergeFileItems,
  mergeLinkItems,
  mergeMediaItems,
  pickBoolean,
  pickNumber,
  pickString,
  sanitizeDownloadName,
} from '@/lib/userProfile/profileMediaItems';

describe('profileMediaItems helpers (moved verbatim from UserProfileModal)', () => {
  it('pickString/pickNumber/pickBoolean read the first usable key', () => {
    expect(pickString({ a: ' x ' }, ['missing', 'a'])).toBe('x');
    expect(pickString(null, ['a'])).toBeNull();
    expect(pickNumber({ n: '42' }, ['n'])).toBe(42);
    expect(pickNumber({ n: 'nope' }, ['n'])).toBeNull();
    expect(pickBoolean({ b: 'TRUE' }, ['b'])).toBe(true);
    expect(pickBoolean({ b: 0 }, ['b'])).toBe(false);
    expect(pickBoolean({ b: 'maybe' }, ['b'])).toBeNull();
  });

  it('mapMediaFromRow keeps only image/audio rows and hides ccx captions', () => {
    expect(
      mapMediaFromRow({ id: '1', content: 'hello', message_type: 'text', metadata: null }),
    ).toBeNull();
    const media = mapMediaFromRow({
      id: '2',
      content: 'ccx:v1:abc',
      message_type: 'image',
      metadata: { signed_url: 'https://cdn/x.jpg', is_encrypted_media: true },
    });
    expect(media).toMatchObject({
      id: '2',
      mediaType: 'image',
      sourceUrl: 'https://cdn/x.jpg',
      caption: null,
      isEncrypted: true,
    });
  });

  it('mapFilesFromRow masks encrypted snippets and falls back to Attachment', () => {
    const file = mapFilesFromRow({
      id: 'f1',
      content: 'see ccx:v1:secretbits',
      message_type: 'file',
      metadata: { attachment_size: 2048 },
    });
    expect(file.fileName).toBe('see [encrypted attachment]');
    expect(file.sizeBytes).toBe(2048);
    expect(file.mimeType).toBe('application/octet-stream');
  });

  it('merge helpers prefer local fields but keep BFF fallbacks', () => {
    const merged = mergeMediaItems(
      [
        {
          id: 'a',
          mediaType: 'image',
          sourceUrl: null,
          storagePath: 'p/local',
          caption: 'local',
          mimeType: null,
          isEncrypted: false,
        },
      ],
      [
        {
          id: 'a',
          mediaType: 'image',
          sourceUrl: 'https://cdn/a.jpg',
          storagePath: null,
          caption: null,
          mimeType: 'image/jpeg',
          isEncrypted: true,
        },
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      sourceUrl: 'https://cdn/a.jpg',
      storagePath: 'p/local',
      caption: 'local',
      mimeType: 'image/jpeg',
      isEncrypted: true,
    });

    const files = mergeFileItems(
      [
        {
          id: 'f',
          fileName: 'Attachment',
          sizeBytes: 0,
          mimeType: 'application/octet-stream',
          timestamp: '',
          downloadUrl: null,
          storagePath: null,
          envelope: null,
        },
      ],
      [
        {
          id: 'f',
          fileName: 'notes.pdf',
          sizeBytes: 100,
          mimeType: 'application/pdf',
          timestamp: '2026-01-01',
          downloadUrl: 'https://cdn/f',
          storagePath: 'p',
          envelope: null,
        },
      ],
    );
    expect(files[0]).toMatchObject({
      fileName: 'notes.pdf',
      sizeBytes: 100,
      mimeType: 'application/pdf',
      timestamp: '2026-01-01',
    });

    const links = mergeLinkItems(
      [{ id: '1:https://a', url: 'https://a', timestamp: 't1' }],
      [
        { id: '2:https://a', url: 'https://a', timestamp: 't2' },
        { id: '2:https://b', url: 'https://b', timestamp: 't2' },
      ],
    );
    expect(links.map((l) => l.url).sort()).toEqual(['https://a', 'https://b']);
  });

  it('extractLinks dedupes and trims trailing punctuation', () => {
    const links = extractLinks([
      { id: 'm1', content: 'see https://example.com/page).', timestamp: 't1' },
      { id: 'm2', content: 'again https://example.com/page', timestamp: 't2' },
    ]);
    expect(links).toEqual([
      { id: 'm1:https://example.com/page', url: 'https://example.com/page', timestamp: 't1' },
    ]);
  });

  it('formatFileSize / sanitizeDownloadName / extensionFromMime / maskEncryptedSnippet', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3 MB');
    expect(sanitizeDownloadName('a/b:c*d.txt')).toBe('a_b_c_d.txt');
    expect(sanitizeDownloadName('   ')).toBe('Attachment');
    expect(extensionFromMime('image/jpeg')).toBe('jpg');
    expect(extensionFromMime('audio/mpeg')).toBe('m4a');
    expect(extensionFromMime(null)).toBe('bin');
    expect(maskEncryptedSnippet('x ccx:v1:abc y')).toBe('x [encrypted attachment] y');
  });
});
