/**
 * Per-user send cooldown for community hub messages.
 * Server is source of truth; clients mirror for UX countdown.
 */

export const HUB_MESSAGE_COOLDOWN_SECONDS = 5;

export type HubCooldownCheck = {
  allowed: true;
} | {
  allowed: false;
  retryAfterSeconds: number;
};

/**
 * @param lastCreatedAtIso ISO timestamp of the user's most recent message in this hub, or null
 * @param nowMs current time in epoch ms
 */
export function checkHubMessageCooldown(
  lastCreatedAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): HubCooldownCheck {
  if (lastCreatedAtIso == null || lastCreatedAtIso.trim() === "") {
    return { allowed: true };
  }
  const lastMs = Date.parse(lastCreatedAtIso);
  if (Number.isNaN(lastMs)) {
    return { allowed: true };
  }
  const elapsedMs = nowMs - lastMs;
  const cooldownMs = HUB_MESSAGE_COOLDOWN_SECONDS * 1000;
  if (elapsedMs >= cooldownMs) {
    return { allowed: true };
  }
  const remainingMs = cooldownMs - elapsedMs;
  const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return { allowed: false, retryAfterSeconds };
}
