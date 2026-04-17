/**
 * Client-side validation for arbitrary chat attachments (Phase 2 — B3).
 *
 * Rules MUST match the KMP implementation at
 * `click/composeApp/src/commonMain/kotlin/compose/project/click/click/chat/attachments/ChatAttachmentValidator.kt`
 * byte-for-byte. Keep both sides in sync or cross-platform uploads will desync.
 */

/** 2 MiB in bytes. */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

export const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  'pdf',
  'docx',
  'txt',
  'png',
  'jpg',
  'jpeg',
  'mov',
  'mp4',
  'zip',
  'csv',
]);

export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'video/quicktime',
  'video/mp4',
  'application/zip',
  'application/x-zip-compressed',
  'text/csv',
  'application/csv',
]);

export const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe', 'apk', 'sh', 'bat', 'cmd', 'com', 'scr', 'msi', 'dll', 'jar',
  'js', 'vbs', 'ps1', 'bin', 'deb', 'dmg', 'app', 'rpm',
]);

export type AttachmentValidationReason =
  | 'empty'
  | 'too_large'
  | 'blocked_extension'
  | 'disallowed_extension'
  | 'disallowed_mime'
  | 'missing_filename';

export type AttachmentValidationResult =
  | { ok: true }
  | { ok: false; reason: AttachmentValidationReason; message: string };

/** Lowercase extension (no dot) or `null` if the filename has no extension. */
export function extensionOf(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  if (!ext.trim() || ext.includes('/') || ext.includes('\\')) return null;
  return ext;
}

/**
 * Validate an attachment **before** encryption.
 * Mirrors the Kotlin `validate()` exactly (same order of checks, same reasons).
 */
export function validateAttachment(input: {
  fileName: string | null | undefined;
  mimeType: string | null | undefined;
  sizeBytes: number;
}): AttachmentValidationResult {
  const trimmedName = (input.fileName ?? '').trim();
  if (!trimmedName) {
    return { ok: false, reason: 'missing_filename', message: 'Attachment is missing a filename.' };
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, reason: 'empty', message: 'Attachment is empty.' };
  }

  if (input.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: 'too_large',
      message: 'Attachment exceeds the 2 MB size limit.',
    };
  }

  const extension = extensionOf(trimmedName);
  if (!extension) {
    return {
      ok: false,
      reason: 'disallowed_extension',
      message: 'Attachment has no recognizable extension.',
    };
  }

  if (BLOCKED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      reason: 'blocked_extension',
      message: 'Executable attachments are not permitted.',
    };
  }

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      reason: 'disallowed_extension',
      message: `Attachments of type .${extension} are not supported.`,
    };
  }

  const normalizedMime = (input.mimeType ?? '').trim().toLowerCase();
  if (normalizedMime && !ALLOWED_MIME_TYPES.has(normalizedMime)) {
    return {
      ok: false,
      reason: 'disallowed_mime',
      message: `MIME type ${normalizedMime} is not supported.`,
    };
  }

  return { ok: true };
}

/**
 * Convenience for HTML `<input accept="...">` and drag-and-drop pickers. Lists dotted extensions
 * plus explicit MIME types so browsers filter aggressively on the native file dialog.
 */
export const ATTACHMENT_ACCEPT_STRING: string = [
  ...Array.from(ALLOWED_EXTENSIONS).map((ext) => `.${ext}`),
  ...Array.from(ALLOWED_MIME_TYPES),
].join(',');
