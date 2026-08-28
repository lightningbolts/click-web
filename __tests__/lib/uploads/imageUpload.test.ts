import {
  formatAcceptedMimeLabels,
  isAcceptedImageMime,
  normalizeImageUploadResponse,
  uploadImageFile,
  validateImageFile,
} from '@/lib/uploads/imageUpload';
import {
  AVATAR_IMAGE_MIME_TYPES,
  COVER_IMAGE_MIME_TYPES,
  UPLOAD_FALLBACK_ERROR,
} from '@/lib/uploads/constants';

jest.mock('@/lib/auth/freshAuthHeaders', () => ({
  getFreshAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeFile(name: string, type: string, size: number): File {
  const buffer = new Uint8Array(size);
  return new File([buffer], name, { type });
}

describe('image upload validation', () => {
  it('accepts cover mime types', () => {
    expect(isAcceptedImageMime('image/jpeg', COVER_IMAGE_MIME_TYPES)).toBe(true);
    expect(isAcceptedImageMime('image/png', COVER_IMAGE_MIME_TYPES)).toBe(true);
    expect(isAcceptedImageMime('image/webp', COVER_IMAGE_MIME_TYPES)).toBe(true);
    expect(isAcceptedImageMime('image/gif', COVER_IMAGE_MIME_TYPES)).toBe(true);
    expect(isAcceptedImageMime('image/bmp', COVER_IMAGE_MIME_TYPES)).toBe(false);
  });

  it('accepts avatar mime types', () => {
    expect(isAcceptedImageMime('image/jpeg', AVATAR_IMAGE_MIME_TYPES)).toBe(true);
    expect(isAcceptedImageMime('image/jpg', AVATAR_IMAGE_MIME_TYPES)).toBe(true);
    expect(isAcceptedImageMime('image/png', AVATAR_IMAGE_MIME_TYPES)).toBe(true);
    expect(isAcceptedImageMime('image/webp', AVATAR_IMAGE_MIME_TYPES)).toBe(false);
  });

  it('returns precise validation errors', () => {
    const tooLarge = validateImageFile(
      makeFile('big.png', 'image/png', 2_000_001),
      AVATAR_IMAGE_MIME_TYPES,
    );
    expect(tooLarge).toEqual({ ok: false, error: 'Image must be under 2 MB.' });

    const wrongType = validateImageFile(
      makeFile('photo.webp', 'image/webp', 100),
      AVATAR_IMAGE_MIME_TYPES,
    );
    expect(wrongType).toEqual({ ok: false, error: 'Only JPG, PNG are supported.' });
  });

  it('formats accepted mime labels for cover uploads', () => {
    expect(formatAcceptedMimeLabels(COVER_IMAGE_MIME_TYPES)).toBe('JPG, PNG, WebP, GIF');
  });
});

describe('normalizeImageUploadResponse', () => {
  it('extracts image URLs from beacon and avatar responses', () => {
    expect(normalizeImageUploadResponse({ image: 'https://cdn.example/a.jpg' })).toEqual({
      url: 'https://cdn.example/a.jpg',
      serverError: null,
    });
    expect(normalizeImageUploadResponse({ error: 'Unauthorized' })).toEqual({
      url: null,
      serverError: 'Unauthorized',
    });
  });
});

describe('uploadImageFile', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('posts base64 JSON to the configured endpoint and returns the image URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ image: 'https://cdn.example/cover.jpg' }),
    });

    const file = makeFile('cover.jpg', 'image/jpeg', 1200);
    const result = await uploadImageFile(file, {
      endpoint: '/api/beacons/image',
      acceptedMimeTypes: COVER_IMAGE_MIME_TYPES,
    });

    expect(result).toEqual({ ok: true, url: 'https://cdn.example/cover.jpg' });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/beacons/image',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"mime_type":"image/jpeg"'),
      }),
    );
  });

  it('returns the fallback error for failed uploads', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Storage upload failed' }),
    });

    const file = makeFile('avatar.png', 'image/png', 1200);
    const result = await uploadImageFile(file, {
      endpoint: '/api/user/avatar',
      acceptedMimeTypes: AVATAR_IMAGE_MIME_TYPES,
    });

    expect(result).toEqual({ ok: false, error: UPLOAD_FALLBACK_ERROR });
  });
});
