import cfLoader, { supabaseRenderUrl } from '@/lib/images/cfLoader';

const OBJ = 'https://abc.supabase.co/storage/v1/object/public/avatars/u/1.jpg';

describe('cfLoader', () => {
  it('rewrites Supabase public objects to the render endpoint', () => {
    expect(cfLoader({ src: OBJ, width: 128 })).toBe(
      'https://abc.supabase.co/storage/v1/render/image/public/avatars/u/1.jpg?width=128&quality=75&resize=contain',
    );
  });

  it('keeps existing query params (cache busters)', () => {
    expect(supabaseRenderUrl(`${OBJ}?v=3`, 64, 60)).toBe(
      'https://abc.supabase.co/storage/v1/render/image/public/avatars/u/1.jpg?v=3&width=64&quality=60&resize=contain',
    );
  });

  it('passes local and third-party images through with a width marker', () => {
    expect(cfLoader({ src: '/landing/hero.webp', width: 640 })).toBe('/landing/hero.webp?w=640');
    expect(cfLoader({ src: 'https://x.test/a.png?b=1', width: 32 })).toBe('https://x.test/a.png?b=1&w=32');
  });

  it('leaves data URLs alone', () => {
    expect(cfLoader({ src: 'data:image/png;base64,AA', width: 32 })).toBe('data:image/png;base64,AA');
  });
});
