/**
 * Legacy path alias for beacon-by-id mutations and reads.
 * Identical behavior to `/api/beacons/[beaconId]`.
 * Auth: getSupabaseFromRouteRequest in the beacons/[beaconId] route handler.
 */
export { GET, PATCH, DELETE } from '../../../beacons/[beaconId]/route';
