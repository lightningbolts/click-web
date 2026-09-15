# Event Hub Repair Invariant

Event chat resolution is server-authoritative. `hub_venues.event_beacon_id` is the canonical event-to-hub relationship; `map_beacons.hub_id` and metadata `hub_id` are compatibility pointers only.

Active historical events that predate automatic hub provisioning are repaired either by the backfill migration or lazily by the event-chat resolver. The lazy path is idempotent: the unique canonical event link arbitrates concurrent repair attempts, and a losing request re-reads the winning hub instead of exposing a permanent `EVENT_HUB_NOT_READY` state.

Expired events with no historical hub are not provisioned retroactively. Existing hubs continue to be resolved so the normal gatekeeper can return the canonical expiry state.

Authorization is deliberately independent from a stale `hub_participants` row. Event-hub access is granted to the event creator/hub creator, a user with an active check-in, or a current RSVP, while the hub remains unexpired. `hub_participants` is maintained for compatibility with list/key flows but is not the event-hub authorization source of truth.
