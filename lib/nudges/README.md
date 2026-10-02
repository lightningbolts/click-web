# Nudges (`lib/nudges`)

## Reconnect near here (F6, flag `reconnect_nearby`)

On app open with foreground location the client calls `GET /api/nudges/reconnect?lat&lng`. The
server rounds to ~100 m, never stores it, and picks at most one connection the viewer met within
`radius_meters` (100) at least `min_age_days` (14) ago (`lib/nudges/reconnectNearby.ts`): active
connections only (archived, hidden, blocked, ghosted excluded), nobody met anywhere in the last
14 days, not at a place the viewer is at constantly (encounters there on `frequent_place_days` of the
last `frequent_window_days`), not muted, at most one a day and `cooldown_days` (30) per connection
(`place_nudges`). The copy recalls only the past meeting. `POST /api/nudges/reconnect/{id}`
records `acted` or `dismissed`, optionally muting the person or the place (`nudge_mutes`).
Push (spec 8b) is not built.
