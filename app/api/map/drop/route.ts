/**
 * POST /api/map/drop — alias for collaborative map beacon drops.
 * Delegates to POST /api/beacons (supports optional encounter_id for Squad pin multiplier).
 * Auth: getSupabaseFromRouteRequest in the beacons route handler.
 */
export { POST } from '../../beacons/route';
