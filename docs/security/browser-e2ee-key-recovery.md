# Browser history recovery without server-readable keys

Status: design-only; **not implemented**. This proposal is intentionally separate from ticketing and existing device-approval fixes.

## Product contract

A returning browser profile with a locally persisted E2EE identity opens history without another approval. A first-time browser may recover its historical chat keys using an enrolled, user-controlled recovery credential. No Click server can independently derive historical epoch keys. Where the credential does not support portable, user-controlled key derivation, show the existing approval or recovery fallback rather than silently downgrading confidentiality. **OAuth/email sign-in alone is not a zero-knowledge recovery secret.** No design can guarantee silent recovery on all arbitrary browsers using only those identity providers while retaining E2EE against a compromised backend.

## Existing code boundaries

- `lib/chat/e2eeV2Client.ts`: IndexedDB-backed browser identity, X25519 recipient envelopes, session key derivation, chat/hub encryption and historical transfers.
- `lib/server/deviceHistory.ts`, `lib/server/deviceApproval.ts`: pending history requests, older-device approval and challenge verification.
- `app/api/chat/devices/*`: device registration, request state, challenge, approval and backfill.
- `click-ios/Click/Core/Chat/ChatRepository.swift`: native epoch handling and transfer.

The registry's `device_id` identifies a cryptographic recipient; hiding browser identities in UI must not delete them or stop epoch-key fanout.

## Threat model and cryptographic protocol

The backup contains encrypted **epoch keys**, never plaintext chat content or a server-decryptable recovery key. For each account establish a random 256-bit backup key (BK) generated client-side. Encrypt a versioned, authenticated manifest of (scope, chat/hub ID, epoch, key) under BK with AES-256-GCM, a unique random 96-bit nonce per write and authenticated metadata binding user ID and format version. Store backup ciphertext plus nonces in user-scoped storage. A device holding historical epoch keys progressively adds missing epochs without uploading plaintext. Concurrent writers must use an explicit version/compare-and-swap or per-epoch immutable records to avoid lost updates; reject rollback/downgrade in clients.

BK must be recoverable via a **user-controlled cryptographic capability**. An example is a passkey's WebAuthn PRF extension, with a stable, account-bound input and a HKDF-SHA-256 derived wrapping key. This depends on browser, authenticator and credential availability and may prompt for user presence. Do not claim all Apple/Google/email sign-ins automatically provide PRF support; they do not. Another option is a user-entered high-entropy recovery secret. Neither backend OAuth tokens nor ordinary passwordless email links may be used as the sole input to derive BK. Do not expose BK, raw PRF outputs or epoch keys to server logs, analytics or API responses.

Use a versioned encrypted BK envelope per enrolled recovery credential. Explicitly specify enrollment, key rotation, lost credential/recovery, revocation, multi-passkey portability, platform compatibility, account deletion and safe backup replacement. Support authenticated metadata checks, request size bounds, rate limiting, fail-closed responses and tests with corrupted ciphertext. Use established browser crypto (WebCrypto) and reviewed WebAuthn libraries; never invent a custom cipher.

## Proposed phased implementation

1. Introduce **opt-in backup enrollment** on an already trusted device. Verify supported WebAuthn PRF behavior end-to-end before enabling a credential; otherwise leave the existing approved-device history transfer unchanged.
2. Add authenticated, row-level isolated backup ciphertext storage and versioned envelopes via new Supabase migration and API endpoints. Do not grant service roles plaintext keys; the service only stores ciphertext.
3. Backfill existing historical chat and hub epochs incrementally from trusted devices. Record completeness; never claim full history when keys are absent on every participating device.
4. Implement web restore after ordinary login, only if a recovery credential is already enrolled and usable. Unlock BK client-side, decrypt/validate the manifest and import epoch keys into the existing E2EE machinery. Suppress redundant approval prompts **only after restore succeeds**.
5. Preserve one-time approval and email fallback for unsupported browsers or missing credentials. Test Safari, Chrome, independent profiles, private browsing, synced/non-synced passkeys and devices without any past keys.
6. Release behind a capability flag, collect *non-secret* restore/error metrics, complete a cryptographic design/security review and staged rollout. Preserve previously encrypted messages and old client compatibility.

## Acceptance criteria

- Existing browser profile: complete retained history is readable without repeated approval.
- New browser with enrolled supported PRF credential: encrypted backup decrypts locally after any required authenticator interaction; server receives no decryption material.
- Fresh browser lacking usable credential: clearly offers existing approval, never receives server-readable keys or falsely says history is recovered.
- Independent account with a valid token cannot fetch another account's backups.
- Wrong credential, tampering, rollback and revoked credential fail closed.
- Native E2EE history and group/hub messaging remain readable; no ticketing/Stripe paths changed.
- No globally shared server-managed recovery secret, and no plaintext key upload.

## Review gate

This document is an implementation contract, **not a feature release**. Do not merge a change that removes the existing device approval before end-to-end recovery has been implemented and verified.
