import { eventHref, personHref, threadHref } from '@/lib/shell/appNav';

/** Where tapping an Activity row goes: the same routing as a push tap (data is string-only). */
export function activityHref(item: { type: string; data: Record<string, string>; actor?: { id: string } | null }): string {
  const d = item.data;
  if (d.beacon_id) {
    return item.type === 'event_rsvp_request' ? `${eventHref(d.beacon_id)}/manage` : eventHref(d.beacon_id);
  }
  if (d.connection_id) return threadHref(d.connection_id);
  if (item.actor?.id) return personHref(item.actor.id);
  return '/activity';
}
