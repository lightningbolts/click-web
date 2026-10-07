const DEFAULT_ORIGIN = "https://joinclick.co";

export function publicOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    DEFAULT_ORIGIN;
  return raw;
}

export function eventSharePath(beaconId: string): string {
  return `/e/${beaconId}`;
}

export function eventManagePath(beaconId: string): string {
  return `/e/${beaconId}/manage`;
}

/** The attendee's Click Pass (spec 06 §1). */
export function eventPassPath(beaconId: string): string {
  return `/e/${beaconId}/pass`;
}

/** The event page with its chat open (the chat sheet opens on `#chat`). */
export function eventChatPath(beaconId: string): string {
  return `/e/${beaconId}#chat`;
}

/** The host's door scanner (spec 06 §7). */
export function eventScanPath(beaconId: string): string {
  return `/e/${beaconId}/scan`;
}

export function eventEditPath(beaconId: string): string {
  return `/e/${beaconId}/manage/edit`;
}

export function eventShareUrl(beaconId: string, origin = publicOrigin()): string {
  return `${origin}${eventSharePath(beaconId)}`;
}

export function eventDeepLink(beaconId: string): string {
  return `click://e/${beaconId}`;
}
