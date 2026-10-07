'use client';

import { ImagePlus, Link2, Share } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ds/Button';
import { IconButton } from '@/components/ds/IconButton';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ds/Menu';
import { toast } from '@/components/ds/Toast';
import type { FlyerEvent } from '@/lib/events/flyerEvent';

// The flyer renderer loads on first use, not with every event page.
const ClickFlyerSheet = dynamic(() => import('@/components/events/ClickFlyerSheet').then((m) => m.ClickFlyerSheet), { ssr: false });

async function copyEventLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  } catch {
    toast.error('Couldn’t copy the link.');
  }
}

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
  await copyEventLink(url);
}

/** The event page's Share menu (iOS event toolbar): share or copy the link, or make a Click Flyer. */
export function EventShareMenu({ event }: { event: FlyerEvent }) {
  const [flyer, setFlyer] = useState(false);
  const [used, setUsed] = useState(false);
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <IconButton icon={Share} aria-label="Share event" variant="filled" />
        </MenuTrigger>
        <MenuContent align="end" className="min-w-52">
          <MenuItem icon={Share} onSelect={() => void shareEventLink(event.link, event.title)}>
            Share…
          </MenuItem>
          <MenuItem icon={Link2} onSelect={() => void copyEventLink(event.link)}>
            Copy link
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={ImagePlus}
            onSelect={() => {
              setUsed(true);
              setFlyer(true);
            }}
          >
            Create Click Flyer
          </MenuItem>
        </MenuContent>
      </Menu>
      {used ? <ClickFlyerSheet open={flyer} onOpenChange={setFlyer} event={event} /> : null}
    </>
  );
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
