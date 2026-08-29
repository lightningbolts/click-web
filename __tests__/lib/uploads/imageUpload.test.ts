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
import { authFailureMessage } from '@/lib/auth/freshAuthHeaders';

jest.mock('@/lib/auth/freshAuthHeaders', () => {
  const actual = jest.requireActual('@/lib/auth/freshAuthHeaders') as typeof import('@/lib/auth/freshAuthHeaders');
  return {
    ...actual,
    fetchWithFreshAuth: jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      let res = await fetch(input, init);
      if (res.status === 401) {
        res = await fetch(input, init);
      }
      return res;
    }),
  };
});

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
      status: 200,
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

  it('surfaces the server error instead of the generic fallback', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Storage upload failed' }),
    });

    const file = makeFile('avatar.png', 'image/png', 1200);
    const result = await uploadImageFile(file, {
      endpoint: '/api/user/avatar',
      acceptedMimeTypes: AVATAR_IMAGE_MIME_TYPES,
    });

    expect(result).toEqual({ ok: false, error: 'Storage upload failed' });
  });

  it('retries once on 401 and then maps a lingering 401 to session expired', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

    const file = makeFile('cover.jpg', 'image/jpeg', 1200);
    const result = await uploadImageFile(file, {
      endpoint: '/api/beacons/image',
      acceptedMimeTypes: COVER_IMAGE_MIME_TYPES,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: false, error: authFailureMessage(401, 'Unauthorized') });
  });

  it('returns the fallback error when the body has no message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const file = makeFile('avatar.png', 'image/png', 1200);
    const result = await uploadImageFile(file, {
      endpoint: '/api/user/avatar',
      acceptedMimeTypes: AVATAR_IMAGE_MIME_TYPES,
    });

    expect(result).toEqual({ ok: false, error: UPLOAD_FALLBACK_ERROR });
  });

  it('compresses an oversized cover before uploading it', async () => {
    const OriginalImage = global.Image;
    const createObjectUrl = jest.fn(() => 'blob:cover');
    const revokeObjectUrl = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    global.Image = class {
      src = '';
      naturalWidth = 4000;
      naturalHeight = 3000;
      decode = jest.fn(async () => undefined);
    } as unknown as typeof Image;
    const context = { drawImage: jest.fn() };
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob([new Uint8Array(1_000)], { type: 'image/webp' }));
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ image: 'https://cdn.example/compressed.webp' }),
    });

    const result = await uploadImageFile(
      makeFile('cover.png', 'image/png', 2_000_001),
      {
        endpoint: '/api/beacons/image',
        acceptedMimeTypes: COVER_IMAGE_MIME_TYPES,
        compressOversize: true,
      },
    );

    expect(result).toEqual({ ok: true, url: 'https://cdn.example/compressed.webp' });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/beacons/image',
      expect.objectContaining({ body: expect.stringContaining('"mime_type":"image/webp"') }),
    );
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:cover');
    global.Image = OriginalImage;
    jest.restoreAllMocks();
  });
});
