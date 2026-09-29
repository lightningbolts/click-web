# Click Drops: develop state (`lib/drops`)

One state machine for every Click Drop (chat now; event and shared drops reuse it). Spec §2.

| State | When | Client shows |
|-------|------|--------------|
| `pending` | before `reveal_at` | pixelated preview + countdown |
| `ready` | `reveal_at` passed, viewer hasn't developed | quiet pixelated preview, no badge |
| `developed` | viewer tapped, or was on screen at zero | the original |

`developed` is per viewer and stored server-side (`drop_views`), so it syncs across devices.

## Gating originals

Clients must only ever hold the pixelated rendition before `reveal_at`.

- Gated media lives in the private `click-drops` bucket, which has **no** client storage policies.
- **Chat drops** (flag `drops_develop`): the sender uploads the E2EE pixelated preview as the
  message's normal media, and the E2EE original through `POST /api/chat/media` with
  `drop_original: true` (response has `url: null`). The message names the original once in
  `metadata.drop_original_path`; `lib/server/chatMessageWrite.ts` moves it into
  `chat_drop_originals` and stores `drop_gated: true` instead. The original's v2 media fields travel
  in `metadata.drop_original` so recipients can decrypt it after developing.
- Legacy drops (original already in the message) still develop through the same endpoint; they just
  have no original to sign.

## API

| Route | Role |
|-------|------|
| `POST /api/drops/develop` | `{ drops: [{ kind, id }] }` (1–50). Ready → marks developed, returns a 10-minute signed URL for gated originals. Pending stays pending. Unknown/forbidden → `not_found`. |
| `GET /api/drops/views?kind=chat&ids=…` | The viewer's `developed_at` per drop. |
| `GET /api/cron/drops` | Hourly: one batched "ready to develop" push per recipient (`type: disposable_reveal`). |

Gated drops are excluded from the legacy per-session reveal push so nobody is notified twice.

## Files

| Path | Role |
|------|------|
| `lib/drops/developState.ts` | Pure state machine (mirrored in Swift/Kotlin) |
| `lib/server/drops/storage.ts` | Bucket, path layout, signing, removal |
| `lib/server/drops/chatDrops.ts` | Gated chat-drop extraction, registry, access resolution |
| `lib/server/drops/develop.ts` | Batch develop across kinds |
| `lib/cron/dropsReady.ts` | Batched ready push |
| `lib/server/featureFlags.ts` | Server-driven flags (`GET /api/me/features`) |
| `supabase/migrations/20260930000000_feature_flags_and_drop_develop.sql` | Schema |
