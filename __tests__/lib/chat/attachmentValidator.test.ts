import {
  MAX_ATTACHMENT_BYTES,
  validateAttachment,
  extensionOf,
  ATTACHMENT_ACCEPT_STRING,
} from '@/lib/chat/attachmentValidator';

describe('validateAttachment', () => {
  it('rejects empty file name', () => {
    const r = validateAttachment({ fileName: '   ', mimeType: 'application/pdf', sizeBytes: 1024 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('missing_filename');
  });

  it('rejects zero bytes', () => {
    const r = validateAttachment({ fileName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });

  it('rejects negative bytes', () => {
    const r = validateAttachment({ fileName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });

  it('rejects NaN size', () => {
    const r = validateAttachment({ fileName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: Number.NaN });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });

  it('accepts exactly MAX_ATTACHMENT_BYTES', () => {
    const r = validateAttachment({
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
      sizeBytes: MAX_ATTACHMENT_BYTES,
    });
    expect(r).toEqual({ ok: true });
  });

  it('rejects one byte over the limit', () => {
    const r = validateAttachment({
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
      sizeBytes: MAX_ATTACHMENT_BYTES + 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too_large');
  });

  it.each([
    'malware.exe',
    'installer.APK',
    'script.sh',
    'tool.msi',
    'backdoor.bat',
    'payload.JS',
  ])('blocks executable %s', (name) => {
    const r = validateAttachment({ fileName: name, mimeType: 'application/octet-stream', sizeBytes: 1024 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('blocked_extension');
  });

  it('rejects an unknown extension', () => {
    const r = validateAttachment({ fileName: 'photo.webp', mimeType: 'image/webp', sizeBytes: 1024 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('disallowed_extension');
  });

  it('rejects a file without extension', () => {
    const r = validateAttachment({ fileName: 'README', mimeType: 'text/plain', sizeBytes: 1024 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('disallowed_extension');
  });

  it('rejects a valid extension with the wrong MIME', () => {
    const r = validateAttachment({ fileName: 'safe.pdf', mimeType: 'application/x-sh', sizeBytes: 1024 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('disallowed_mime');
  });

  it.each([
    ['doc.pdf', 'application/pdf'],
    ['report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['notes.txt', 'text/plain'],
    ['hero.png', 'image/png'],
    ['pic.JPG', 'image/jpeg'],
    ['pic.jpeg', 'image/jpeg'],
    ['clip.mov', 'video/quicktime'],
    ['clip.mp4', 'video/mp4'],
    ['bundle.zip', 'application/zip'],
    ['data.csv', 'text/csv'],
  ])('accepts canonical %s (%s)', (name, mime) => {
    const r = validateAttachment({ fileName: name, mimeType: mime, sizeBytes: 1024 });
    expect(r).toEqual({ ok: true });
  });

  it('accepts a missing MIME when extension is valid', () => {
    const r = validateAttachment({ fileName: 'data.csv', mimeType: null, sizeBytes: 1024 });
    expect(r).toEqual({ ok: true });
  });
});

describe('extensionOf', () => {
  it('returns lowercase extension', () => {
    expect(extensionOf('File.PDF')).toBe('pdf');
  });
  it('returns the final extension for multi-dot filenames', () => {
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });
  it('returns null for no extension', () => {
    expect(extensionOf('noext')).toBeNull();
  });
  it('returns null for a trailing dot', () => {
    expect(extensionOf('trailing.')).toBeNull();
  });
});

describe('ATTACHMENT_ACCEPT_STRING', () => {
  it('contains all allowed dotted extensions', () => {
    for (const ext of ['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'mov', 'mp4', 'zip', 'csv']) {
      expect(ATTACHMENT_ACCEPT_STRING).toContain(`.${ext}`);
    }
  });
  it('contains canonical MIME types', () => {
    for (const mime of ['application/pdf', 'image/png', 'video/mp4']) {
      expect(ATTACHMENT_ACCEPT_STRING).toContain(mime);
    }
  });
});
