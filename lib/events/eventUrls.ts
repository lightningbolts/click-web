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

export function eventEditPath(beaconId: string): string {
  return `/e/${beaconId}/edit`;
}

export function eventShareUrl(beaconId: string, origin = publicOrigin()): string {
  return `${origin}${eventSharePath(beaconId)}`;
}

export function eventDeepLink(beaconId: string): string {
  return `click://e/${beaconId}`;
}
