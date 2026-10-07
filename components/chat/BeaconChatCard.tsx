'use client';

import { EventMarkdownPreview } from '@/components/events/EventMarkdownContent';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import type { Message } from '@/lib/chat/types';
import { eventSharePath } from '@/lib/events/eventUrls';
import { mapBeaconPreview } from '@/lib/userProfile/profileMediaItems';
import { CardVisual } from '@/components/ds/CardVisual';
import { StatusPill } from '@/components/ds/StatusPill';

function beaconTypeFromMetadata(metadata: Message['metadata']): string {
  const rec = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
  const raw = rec.beacon_type ?? rec.beaconType;
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

/**
 * Compact chat-timeline card for a shared beacon (parity with KMP BeaconChatCard).
 * Cover uses CardVisual; width is capped at 280px like mobile.
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
      className="w-full max-w-[280px] overflow-hidden rounded-lg border border-hairline bg-bg-elevated text-left shadow-overlay"
    >
      <CardVisual seed={preview.beaconId || message.id} photoUrl={preview.imageUrl} radius={0} className="h-28" sizes="280px">
        {chipLabel ? (
          <StatusPill variant="on-media" className="absolute left-2 top-2">
            {chipLabel}
          </StatusPill>
        ) : null}
      </CardVisual>
      <div className="space-y-1 px-3 py-2.5">
        <p className="type-body-strong line-clamp-2 text-fg">{preview.title}</p>
        {metaLine ? (
          <p className="type-meta flex items-start gap-1 text-fg-secondary">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span className="line-clamp-2">{metaLine}</span>
          </p>
        ) : null}
        {preview.description ? (
          <EventMarkdownPreview title={preview.title} className="type-meta line-clamp-2 text-fg-tertiary">
            {preview.description}
          </EventMarkdownPreview>
        ) : null}
      </div>
    </article>
  );

  if (!href) return body;

  return (
    <Link href={href} className="block max-w-[280px] rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent">
      {body}
    </Link>
  );
}
