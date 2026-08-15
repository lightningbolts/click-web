/** Cover URL for a beacon card. Mirrors mobile `MapBeaconMetadata.heroImageUrl()`. */
export function beaconHeroImageUrl(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;
  const keys = [
    'albumArtUrl',
    'album_art_url',
    'artworkUrl100',
    'image_url',
    'cover_url',
    'artwork_url',
  ];
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
