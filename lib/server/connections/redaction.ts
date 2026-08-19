import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import {
  collectEventBeaconIdsFromConnections,
  filterBeaconIdsWithActiveEngagement,
  stripConnectionEncountersEventFieldsForViewer,
} from '@/lib/server/resolveLiveEventBeaconAt';

/**
 * Hide event_beacon_* / at_event on embedded encounters unless the viewer has
 * RSVP + active check-in for that beacon (per-person event attachment).
 */
export async function redactEventFieldsForViewer(
  viewerUserId: string,
  connections: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const beaconIds = collectEventBeaconIdsFromConnections(connections);
  if (beaconIds.length === 0) return connections;
  const admin = createAdminClient();
  const eligible = await filterBeaconIdsWithActiveEngagement(admin, viewerUserId, beaconIds);
  return stripConnectionEncountersEventFieldsForViewer(connections, eligible);
}

export async function redactSingleConnectionForViewer(
  viewerUserId: string,
  connection: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const [redacted] = await redactEventFieldsForViewer(viewerUserId, [connection]);
  return redacted ?? connection;
}
