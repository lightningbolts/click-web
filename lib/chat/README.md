# Chat library (`lib/chat`)

Client and server-shared types, message normalization, E2EE crypto (parity with KMP `MessageCrypto`), attachment handling, and disposable roll metadata. The web dashboard decrypts and displays the same wire format as iOS/Android.

---

## Purpose

Provide a single source of truth for:

- **Message schema** — `Message`, `MessageType`, reactions, delivery/read timestamps
- **DB normalization** — `normalizeDbMessage` for PostgREST and Realtime payloads
- **Insert builders** — `buildMessageInsertRow` including Disposable Roll TTL metadata
- **E2EE** — AES-256-CBC + HMAC-SHA256 encrypt-then-MAC, 1:1 and group clique keys
- **API helpers** — call logs, delivery acks, optimistic UI utilities

Server-side write authorization lives in `lib/server/chatGatekeeper.ts` (documented in `lib/server/README.md`).

---

## Architecture

```
┌──────────────────┐     POST /api/chat/messages      ┌─────────────────────┐
│  ChatView (UI)   │ ───────────────────────────────► │  chatGatekeeper     │
│  crypto.ts E2EE  │     ciphertext in content        │  assertChatWritable │
└────────┬─────────┘                                  └──────────┬──────────┘
         │ decrypt on read                                        │
         ▼                                                        ▼
   messages.ts                                          Postgres messages
   normalizeDbMessage                                   (content = e2e:…)
```

### `types.ts`

| Export | Description |
|--------|-------------|
| `MessageType` | `'text' \| 'image' \| 'audio' \| 'file' \| 'call_log' \| 'beacon'` — matches `public.messages.message_type` and KMP `ChatMessageType`. Beacon rows render as `BeaconChatCard` in the timeline (not plaintext `Beacon: …`). |
| `Message` | Full row shape including `local_sent_at`, `delivered_at`, `read_at`, `metadata` |
| `MessageMediaMetadata` | `media_url`, `is_encrypted_media`, `original_mime_type`, `duration_seconds`, reply threading |
| `REACTION_EMOJIS` | Quick reaction strip defaults |

### `messages.ts`

| Function | Role |
|----------|------|
| `normalizeDbMessage(row)` | Safe coercion from DB/Realtime records; handles new columns with defaults; coerces `text` + `beacon_id` metadata to `message_type: 'beacon'` |
| `isBeaconChatMessage` / `shouldSkipChatDecrypt` | Beacon detection (type or metadata) and E2EE skip, matching KMP |
| `buildMessageInsertRow(params)` | Builds insert payload; when `metadata.disposable_roll === true`, sets `collaboration_ttl` and `reveal_at` via `computeClickDropRevealTtlIso` (24h) |
| `coerceMessageType` / `coerceMetadata` | Defensive parsing |
| `insertCallLogMessage` | POST call_log rows through messages API |
| `notifyMessagesDelivered` | PATCH `/api/chat/messages/delivered` for sender "Delivered" state |

### `layout.ts`

`CHAT_TRANSCRIPT_MAX_CLASS` (`max-w-none`) is the shared width token for the dashboard chat header, transcript, composer, and starters banner. Fill the product pane; do not cap with `max-w-xl` (skinny gutters) or marketing `max-w-5xl`. Bubble width stays on `MessageBubble` (`max-w-[min(75%,32rem)]`).

### `chatGatekeeper` (server)

`assertChatWritable(admin, userId, chatId)` — see `lib/server/chatGatekeeper.ts`:

- **Group chats** — user must be in `group_members`
- **1:1** — user in `connections.user_ids` and connection status active for chat list (`pending`, `active`, `kept`, etc.)

---

## E2EE parity with mobile `MessageCrypto`

Implemented in `crypto.ts` — must stay byte-compatible with KMP.

### 1:1 connections

```
master  = SHA-256( SALT || sorted_uid_1 || sorted_uid_2 || connection_id )
enc_key = SHA-256( master || 0x01 )
mac_key = SHA-256( master || 0x02 )

Wire: "e2e:" + Base64( IV[16] || HMAC[32] || ciphertext )
```

- `deriveKeysForConnection(connectionId, userIds)` — cached per connection
- `encryptContent` / `decryptContent`
- `isEncrypted(content)` — prefix check

### Group clique messages

```
Wire: "e2e_grp:" + same payload layout
Keys derived from 32-byte group master (from `encrypted_group_key` unwrap)
```

- `deriveKeysFromGroupMaster`, `encryptGroupMessageContent`, `decryptGroupMessageContent`
- `decryptGroupMediaBytes` for attachment blobs

### Media

- Ciphertext bytes: `IV || HMAC || ciphertext` (no `e2e:` prefix on raw blob)
- `metadata.is_encrypted_media` + `original_mime_type` on the message row
- `attachmentCrypto.ts`, `useSecureMedia.ts`, `chatAttachmentStorage.ts` — upload/sign/decrypt pipeline

**Server constraint:** API routes store and forward ciphertext; they never hold decryption keys. `chatGatekeeper` only checks membership, not message content.

---

## Disposable roll metadata

When a user sends a **Click Drop** (disposable photo):

1. Client sets `metadata.disposable_roll: true` and optional `metadata.encounter_id`
2. `buildMessageInsertRow` stamps `collaboration_ttl` / `reveal_at` = now + 24h
3. UI hides content until TTL; `cron-hourly-maintenance` sends reveal push when TTL passes

Collaboration session TTL (local “Squad window”) is separate — computed in `lib/collaboration/collaborationTtl.ts` (typically next day 10:00 local).

---

## Related files

| Path | Role |
|------|------|
| `lib/server/chatGatekeeper.ts` | Write authorization |
| `app/api/chat/search/route.ts` | GET message search across 1:1, cliques, and hubs; skips `e2e:` / `e2e_grp:` bodies |
| `app/api/chat/messages/route.ts` | POST messages + push on new message |
| `app/api/chat/messages/read/route.ts` | Read receipts |
| `app/api/chat/messages/delivered/route.ts` | Delivery receipts |
| `app/api/chat/reactions/route.ts` | Emoji reactions |
| `app/api/chat/attachments/route.ts` | Encrypted uploads |
| `components/chat/ChatView.tsx` | Primary UI |
| `components/chat/MessageBubble.tsx` | Render + reactions |
| `lib/collaboration/clickDropReveal.ts` | 24h reveal ISO helper |
| `lib/chat/groupCliqueKey.ts` | Group master key unwrap |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — Opens a chat row; first messages are E2EE once both sides derive keys.
- **Scan QR** — Same chat pipeline after connection creation via `/api/connections`.
- **Group connect (Multi-Tap)** — Group clique uses `e2e_grp:` wire format and shared master key.
- **Private encrypted chat** — Default for text; server stores `e2e:` blobs only.
- **Send photos/files/voice notes** — Encrypted media with MIME metadata; voice notes use `duration_seconds`.
- **Emoji reactions** — `REACTION_EMOJIS` quick strip + full picker via reactions API.
- **Typing & read receipts** — `read_at` / `is_read`; delivery via `delivered_at` + `notifyMessagesDelivered`.
- **Voice & video calls** — `call_log` message type + LiveKit overlay (not in this folder).
- **Memory Capsules** — Chat is separate from encounter sensor rows; capsules inform ambient UI themes.
- **48-hour gentle archive** — `chatGatekeeper` blocks writes when connection leaves active chat statuses.
- **Connection map & timeline** — Chat previews on dashboard; timeline API is profile module.
- **Rate the vibe** — Post-connection prompts; vibe tags may appear in encounter metadata.
- **QR identity card** — Entry to connection, then chat.
- **Availability intents** — Independent of chat crypto.
- **Match alerts** — Push opens app; chat remains E2EE.
- **Community Hubs** — Ephemeral hub messages use hub API (plaintext hub channel, not connection E2EE).
- **Map beacons** — Map layer alongside chat in dashboard.
- **Global search** — Dashboard filters connections/chats.
- **Core connections** — Sorted/pinned in UI; same E2EE keys.
- **Collaboration sessions & disposable rolls** — Metadata on disposable messages; reveal after TTL.
- **Ghost mode** — Does not affect existing chats.
- **Block & report** — Revokes chat access via connection status.
- **Profile & interests** — Display names in chat bubbles.
- **Onboarding** — Auth before chat subscribe.
- **Google/email auth** — Session for Realtime channels.
- **Push notifications** — New message pushes from messages route (ciphertext body omitted).
- **Deep links & App Clip** — Open connection chat deep links.
- **Web dashboard** — Full chat UI with decrypt in browser.
- **Business insights** — Aggregated; no message content.
- **Event reminders** — Push only.
- **Achievements & stats** — Message counts in dashboard metrics.
