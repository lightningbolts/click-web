import { render } from '@testing-library/react';
import { Building2 } from 'lucide-react';
import { CardVisual } from '@/components/ds/CardVisual';

describe('CardVisual', () => {
  // A component reference can't cross from a Server Component (the public Place page 500'd).
  it('takes its glyph as an element and centers it', () => {
    const { container } = render(<CardVisual seed="place-1" glyph={<Building2 data-testid="glyph" />} />);
    const glyph = container.querySelector('[data-testid="glyph"]')!;
    expect(glyph.tagName.toLowerCase()).toBe('svg');
    expect(glyph.parentElement).toHaveAttribute('aria-hidden');
  });

  it('shows a photo instead of the glyph', () => {
    const { container } = render(<CardVisual seed="place-1" photoUrl="https://example.com/a.jpg" glyph={<Building2 data-testid="glyph" />} />);
    expect(container.querySelector('[data-testid="glyph"]')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });
});
