'use client';

import Link from 'next/link';
import { MapPin } from 'lucide-react';
import type { Message } from '@/lib/chat/types';
import { eventSharePath } from '@/lib/events/eventUrls';
import { mapBeaconPreview } from '@/lib/userProfile/profileMediaItems';
import { CardVisualHero } from '@/components/ui/CardVisualSurface';

function beaconTypeFromMetadata(metadata: Message['metadata']): string {
  const rec = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
  const raw = rec.beacon_type ?? rec.beaconType;
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

/**
 * Compact chat-timeline card for a shared beacon (parity with KMP BeaconChatCard).
 * Cover uses CardVisualHero; width is capped at 280px like mobile.
 */
export default function BeaconChatCard({ message }: { message: Message }) {
  const preview =
    mapBeaconPreview({
      id: message.id,
      content: message.content,
      message_type: message.message_type,
      metadata: message.metadata as Record<string, unknown> | null,
    }) ?? {
      id: message.id,
      beaconId: '',
      title: message.content.replace(/^Beacon:\s*/i, '').trim() || 'Beacon',
    };

  const beaconType = beaconTypeFromMetadata(message.metadata);
  const chipLabel =
    beaconType === 'event' || beaconType === 'social' || beaconType === 'social_vibe'
      ? 'Event'
      : 'Beacon';
  const href = preview.beaconId ? eventSharePath(preview.beaconId) : null;
  const metaLine = [preview.scheduleLabel, preview.locationLabel].filter(Boolean).join(' · ');

  const body = (
    <article
      data-testid="beacon-chat-card"
      className="w-full max-w-[280px] overflow-hidden rounded-[12px] border border-border-hard bg-surface text-left"
    >
      <CardVisualHero
        id={preview.beaconId || message.id}
        imageUrl={preview.imageUrl}
        chipLabel={chipLabel}
        className="h-28"
      />
      <div className="space-y-1 px-3 py-2.5">
        <p className="line-clamp-2 text-sm font-semibold text-on-surface">{preview.title}</p>
        {metaLine ? (
          <p className="flex items-start gap-1 text-[11px] text-on-surface-variant">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span className="line-clamp-2">{metaLine}</span>
          </p>
        ) : null}
        {preview.description ? (
          <p className="line-clamp-2 text-xs text-on-surface-variant">{preview.description}</p>
        ) : null}
      </div>
    </article>
  );

  if (!href) return body;

  return (
    <Link href={href} className="block max-w-[280px] outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {body}
    </Link>
  );
}
