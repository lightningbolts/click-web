'use client';

import { Building2, MessageCircle, MessagesSquare } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ds/Menu';
import { eventChatPath } from '@/lib/events/eventUrls';
import { threadHref } from '@/lib/shell/appNav';

export type HostContact = {
  /** The Place hosting the event. */
  place: { name: string; slug: string } | null;
  /** The host, when they're the viewer's Click. */
  host: { firstName: string; connectionId: string } | null;
};

/**
 * Ways to reach an event's host (spec 06 §6, iOS `HostContactMenu`): their Place page when a
 * Place hosts it, a direct message when they're your Click, and always the event chat (hosts
 * are in it).
 */
export function HostContactMenu({ beaconId, contact, trigger }: { beaconId: string; contact: HostContact; trigger: ReactNode }) {
  return (
    <Menu>
      <MenuTrigger asChild>{trigger}</MenuTrigger>
      <MenuContent align="end" className="min-w-56">
        {contact.place ? (
          <MenuItem asChild icon={Building2}>
            <Link href={`/p/${contact.place.slug}`}>View {contact.place.name}</Link>
          </MenuItem>
        ) : null}
        {contact.host ? (
          <MenuItem asChild icon={MessageCircle}>
            <Link href={threadHref(contact.host.connectionId)}>Message {contact.host.firstName}</Link>
          </MenuItem>
        ) : null}
        <MenuItem asChild icon={MessagesSquare}>
          <Link href={eventChatPath(beaconId)}>Ask in event chat</Link>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
