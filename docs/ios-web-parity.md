# iOS / web parity update

Primary iOS reference: `lightningbolts/click-ios` commit `96e717218d0374eeb4b5f79c8e7f9cadfd1163f2`, including native `HomeFeedModel.swift` and `Docs/PARITY_LEDGER.md`. The earlier Kotlin reference (`lightningbolts/click` commit `c0bd263de107c3b0dd8d19ff8a344c9799148cda`) remains relevant for shared Hub encryption and legacy media compatibility. This is a source comparison, not validation against a running TestFlight build.

## Implemented

- Native Home feed ordering and priority: availability, saved/live nearby events, hangout confirmations, shared-event suggestions, waves, greeting deadlines, anniversaries, reconnect prompts and group revival. Actions retain failed prompts and show accurate waiting/success feedback.
- Recent connections, permission-aware nearby discovery, paginated saved events, separate past/unavailable states, and retained availability data after failed refreshes. Home does not request location permission on its own.
- Home day/week recap using the same `/api/me/recap` endpoint as mobile. Window changes retain prior results with their correct period label. Failures offer retry instead of invented zeros.
- Saved events linking to existing event pages, the next upcoming event, and discovery cards for events, community hubs and connection places.
- Connection insights and reconnect reminders using mobile `ReconnectModels.kt` thresholds: active through 7 days, cooling through 14, dormant through 30, then inactive. Archived/removed/blocked connections and group rows are excluded from reminders.
- Most urgent archive warning using the existing lifecycle rules, connections grouped by place, and contextual icebreaker sends using mobile prompts, encrypted direct-chat delivery and a 15-second cooldown.
- Hubs navigation, opt-in discovery, creation, geofenced join, leave, text chat, replies, editing, deletion, reactions, realtime updates and polling fallback. Event message actions use event authorization without requesting location.
- Local search over decrypted loaded history, older-history pagination preserving timestamp ties, and authorized participant/sender profiles.
- Event chat entry through the authoritative event-chat resolver.
- Hub E2EE v2 initialization, membership rotation, message decryption and encrypted attachment upload/download. Missing keys fail closed. Legacy mobile Hub photos can also be decrypted. Raster images, audio and video have inline previews; documents remain opaque downloads. Disposable photos respect their development time.

## Platform differences and verification limits

- Home uses the existing web event list, map and navigation patterns. Hub search covers loaded messages on the current device; use Load older messages to expand it.
- BLE/ultrasonic handshake initiation, CallKit/PushKit, App Clips and sensor capture remain mobile capabilities.
- Authenticated interoperability, actual geolocation and deployed storage/Realtime policies require real Supabase configuration and test accounts. Mocked contract tests cannot establish those outcomes.
- No production deployment or database migration was performed.

## Validation

Regression coverage includes activity boundaries, archive exclusion, recap transitions, location opt-in, denied Hub joins, encrypted sends/edits, no plaintext fallback after key failures, mobile-compatible epoch unwrap, legacy Hub media, ciphertext attachment upload, reactions, profile visibility and exact history cursors.

- Full Jest suite after combining both chats: 184 suites, 958 tests passed. Follow-up focused tests cover the final Home action cleanup and timed photo reveal.
- Typecheck and full lint passed. Newly added Home card, nearby hook and attachment fixes also pass strict lint with zero warnings.
- Browser layout review: desktop and 390px viewport; no horizontal overflow. The temporary fixture was removed.
- Production build uses documented placeholder Supabase values because live configuration is absent; this does not validate deployed services.
