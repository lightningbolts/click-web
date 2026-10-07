import { render, waitFor } from '@testing-library/react';
import { DropDevelopImage } from '@/components/drops/DropDevelopImage';

let reduceMotion = false;
let decode: jest.Mock;

beforeEach(() => {
  reduceMotion = false;
  decode = jest.fn(() => Promise.resolve());
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: decode });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => ({ drawImage: jest.fn() }) });
  window.matchMedia = ((query: string) => ({
    matches: reduceMotion && query.includes('reduce'),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe('DropDevelopImage', () => {
  it('fades a photo in as it loads when it does not play', () => {
    const { container } = render(<DropDevelopImage src="blob:photo" alt="Drop" plays={false} />);
    const img = container.querySelector('img')!;
    expect(img).toHaveClass('img-reveal');
    expect(img).not.toHaveAttribute('data-loaded');
    img.dispatchEvent(new Event('load'));
    expect(img).toHaveAttribute('data-loaded');
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('holds until the photo decodes, then blooms finer layers 140 ms apart with the photo last', async () => {
    const { container } = render(<DropDevelopImage src="blob:photo" alt="Drop" plays />);
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(container.querySelectorAll('.drop-bloom-layer')).toHaveLength(4));
    const layers = [...container.querySelectorAll<HTMLElement>('.drop-bloom-layer')];
    expect(layers.map((l) => l.style.animationDelay)).toEqual(['0ms', '140ms', '280ms', '420ms']);
    expect(container.querySelectorAll('canvas')).toHaveLength(3);
    expect(layers[3].querySelector('img')).toHaveAttribute('alt', 'Drop');
  });

  it('shows the photo plainly if it cannot decode', async () => {
    decode.mockImplementation(() => Promise.reject(new Error('EncodingError')));
    const { container } = render(<DropDevelopImage src="blob:photo" alt="Drop" plays />);
    await waitFor(() => expect(container.querySelector('img.img-reveal')).not.toBeNull());
    expect(container.querySelector('.drop-bloom-layer')).toBeNull();
  });

  it('never plays with Reduce Motion: the photo fades in', () => {
    reduceMotion = true;
    const { container } = render(<DropDevelopImage src="blob:photo" alt="Drop" plays />);
    expect(container.querySelector('img.img-reveal')).not.toBeNull();
    expect(container.querySelector('.drop-bloom-layer')).toBeNull();
    expect(decode).not.toHaveBeenCalled();
  });
});
