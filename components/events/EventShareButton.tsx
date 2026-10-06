'use client';

import { Share } from 'lucide-react';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ds/Button';
import { IconButton } from '@/components/ds/IconButton';
import { toast } from '@/components/ds/Toast';

/** Native share sheet where there is one, else copy the link with a toast. */
export async function shareEventLink(url: string, title: string): Promise<void> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  } catch {
    toast.error('Couldn’t copy the link.');
  }
}

export function EventShareButton({
  url,
  title,
  variant = 'secondary',
  size = 'sm',
  iconOnly,
}: {
  url: string;
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
}) {
  if (iconOnly) {
    return <IconButton icon={Share} aria-label="Share event" variant="filled" onClick={() => void shareEventLink(url, title)} />;
  }
  return (
    <Button variant={variant} size={size} icon={Share} onClick={() => void shareEventLink(url, title)}>
      Share
    </Button>
  );
}
