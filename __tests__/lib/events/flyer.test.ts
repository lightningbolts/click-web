import { deepenedAccent, flyerPhotoFills, flyerPhotoFrame, flyerPixelSize } from '@/lib/events/flyerCanvas';
import { flyerEvent } from '@/lib/events/flyerEvent';
import { publicEventFixture } from '../../helpers/publicEventFixture';

describe('Click Flyer', () => {
  it('renders Story 1080×1920 and Post 1080×1350', () => {
    expect(flyerPixelSize('story')).toEqual({ width: 1080, height: 1920 });
    expect(flyerPixelSize('post')).toEqual({ width: 1080, height: 1350 });
  });

  it('keeps the picture its own shape within the format, never taller than the cap', () => {
    expect(flyerPhotoFrame('story', { width: 1600, height: 900 })).toEqual({ w: 260, h: 146 });
    expect(flyerPhotoFrame('story', { width: 900, height: 1600 })).toEqual({ w: 260, h: 250 });
    expect(flyerPhotoFrame('post', { width: 1000, height: 1000 })).toEqual({ w: 280, h: 150 });
    expect(flyerPhotoFrame('story', null)).toEqual({ w: 260, h: 163 });
  });

  it('crops a near fit and shows a poster whole', () => {
    expect(flyerPhotoFills({ width: 1600, height: 900 }, { w: 260, h: 146 })).toBe(true);
    expect(flyerPhotoFills({ width: 900, height: 1600 }, { w: 260, h: 250 })).toBe(false);
  });

  it('deepens the picture color for small type, and falls back to violet for grey', () => {
    expect(deepenedAccent(128, 128, 128)).toBe('#7C3AED');
    const [r, g, b] = deepenedAccent(250, 200, 200).slice(1).match(/../g)!.map((h) => parseInt(h, 16));
    expect(r).toBeGreaterThan(g);
    expect(Math.max(r, g, b)).toBeLessThanOrEqual(Math.round(0.7 * 255));
  });

  it('says when in the event time zone and credits the Place as host', () => {
    const f = flyerEvent(
      publicEventFixture({ place: { id: 'p', slug: 'allegro', name: 'Cafe Allegro', category: 'cafe' as never, photo_url: null, city: 'Seattle' } }),
      'Jazz night',
      'https://joinclick.co/e/1',
      'America/Los_Angeles',
    );
    expect(f).toMatchObject({ month: 'OCT', day: '7', when: 'Wed · 7:00 PM', host: 'Hosted by Cafe Allegro', place: 'Cafe Allegro' });
    expect(flyerEvent(publicEventFixture({ event_start_at: null, host_name: null }), 'x', 'l', 'UTC')).toMatchObject({
      month: null,
      day: null,
      when: null,
      host: null,
    });
  });
});
