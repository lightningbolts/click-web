import { mediaAspectFields, mediaAspectFromMetadata, mediaAspectOf } from '@/lib/chat/mediaMetadata';

describe('mediaAspectFromMetadata (iOS MediaAspect.parse)', () => {
  it('reads numbers and numeric strings', () => {
    expect(mediaAspectFromMetadata({ media_aspect: 0.75 })).toBe(0.75);
    expect(mediaAspectFromMetadata({ media_aspect: '1.33' })).toBe(1.33);
  });

  it('clamps extremes to 0.2…5', () => {
    expect(mediaAspectFromMetadata({ media_aspect: 0.05 })).toBe(0.2);
    expect(mediaAspectFromMetadata({ media_aspect: 12 })).toBe(5);
  });

  it('ignores missing, zero, negative and non-numeric values', () => {
    expect(mediaAspectFromMetadata({})).toBeNull();
    expect(mediaAspectFromMetadata(null)).toBeNull();
    expect(mediaAspectFromMetadata({ media_aspect: 0 })).toBeNull();
    expect(mediaAspectFromMetadata({ media_aspect: -1 })).toBeNull();
    expect(mediaAspectFromMetadata({ media_aspect: 'wide' })).toBeNull();
  });
});

describe('mediaAspectOf (iOS MediaAspect.of)', () => {
  const original = globalThis.createImageBitmap;
  afterEach(() => {
    globalThis.createImageBitmap = original;
  });

  it('measures the decoded photo, rounded to 0.01', async () => {
    const close = jest.fn();
    globalThis.createImageBitmap = jest.fn().mockResolvedValue({ width: 3024, height: 4032, close });
    await expect(mediaAspectOf(new Blob())).resolves.toBe(0.75);
    expect(close).toHaveBeenCalled();
    await expect(mediaAspectFields(new Blob())).resolves.toEqual({ media_aspect: 0.75 });
  });

  it('is empty when the browser cannot decode it', async () => {
    globalThis.createImageBitmap = jest.fn().mockRejectedValue(new Error('decode'));
    await expect(mediaAspectOf(new Blob())).resolves.toBeNull();
    await expect(mediaAspectFields(new Blob())).resolves.toEqual({});
  });
});
