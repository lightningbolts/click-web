export function messagesForProfileConnection<T>(
  messages: readonly T[],
  profileConnectionId: string | null | undefined,
  selectedConnectionId: string | null | undefined,
): T[] {
  if (!profileConnectionId || !selectedConnectionId || profileConnectionId !== selectedConnectionId) {
    return [];
  }
  return [...messages];
}
