/** @jest-environment node */
import sharp from 'sharp';

const env: { IMAGES?: unknown } = {};
jest.mock('@/lib/server/cloudflareEnv', () => ({ cloudflareEnv: () => env }));

import { cssRgb, passArt } from '@/lib/server/wallet/passArt';
import { gradientPng } from '@/lib/server/wallet/png';

const event = { image_url: 'https://images.example.com/cover.jpg', visual_seed: 'b1' };

/** A stand-in Images binding that records each transformation and returns a tagged PNG. */
function fakeImages(calls: Array<Record<string, unknown>>) {
  return {
    input: () => ({
      transform: (options: Record<string, unknown>) => ({
        output: async () => {
          calls.push(options);
          return { response: () => new Response(Buffer.from(`png:${options.width}`)) };
        },
      }),
    }),
  };
}

describe('Wallet pass artwork', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete env.IMAGES;
  });

  it('draws a valid gradient PNG at the asked size', async () => {
    const png = gradientPng(6, 4, [0, 0, 0], [200, 100, 50]);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([6, 4, 3]);
    expect([...data.subarray(0, 3)]).toEqual([0, 0, 0]);
    expect([...data.subarray(data.length - 3)]).toEqual([200, 100, 50]);
  });

  it('wears the event picture: a dimmed background and a whole thumbnail', async () => {
    const calls: Array<Record<string, unknown>> = [];
    env.IMAGES = fakeImages(calls);
    global.fetch = jest.fn(async () => new Response(Buffer.from('jpeg-bytes'))) as typeof fetch;

    const art = await passArt(event);
    expect(Object.keys(art.images).sort()).toEqual([
      'background.png', 'background@2x.png', 'background@3x.png',
      'thumbnail.png', 'thumbnail@2x.png', 'thumbnail@3x.png',
    ]);
    expect(art.images['background.png']!.toString()).toBe('png:180');
    expect(art.images['thumbnail@3x.png']!.toString()).toBe('png:270');
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ fit: 'cover', brightness: 0.62 }),
      expect.objectContaining({ fit: 'scale-down' }),
    ]));
  });

  it('falls back to the event colors without a picture, a binding, or a reachable picture', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fallback = (art: Awaited<ReturnType<typeof passArt>>) => {
      expect(Object.keys(art.images)).toEqual(['background.png']);
      expect(art.images['background.png']!.subarray(1, 4).toString()).toBe('PNG');
    };

    fallback(await passArt(event)); // no binding
    env.IMAGES = fakeImages(calls);
    fallback(await passArt({ ...event, image_url: null }));
    global.fetch = jest.fn(async () => new Response('nope', { status: 404 })) as typeof fetch;
    fallback(await passArt(event));
    expect(calls).toHaveLength(0);
  });

  it('keeps the card dark enough for white type', async () => {
    const { backgroundColor } = await passArt({ ...event, image_url: null });
    expect(Math.max(...backgroundColor)).toBeLessThan(140);
    expect(cssRgb(backgroundColor)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });
});
