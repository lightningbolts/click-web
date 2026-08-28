export function shouldShowEventFullCard({
  atCapacity,
  going,
  requestStatus,
  ended,
}: {
  atCapacity: boolean;
  going: boolean;
  requestStatus: string | null | undefined;
  ended: boolean;
}): boolean {
  return (
    atCapacity &&
    !going &&
    requestStatus !== "pending" &&
    requestStatus !== "waitlisted" &&
    !ended
  );
}

export function shouldShowEventRsvpPanel({
  rsvpEnabled,
  ended,
}: {
  rsvpEnabled: boolean;
  ended: boolean;
}): boolean {
  return rsvpEnabled || ended;
}
