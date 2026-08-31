/** PostgREST URL length blows up on large `.in()` lists — keep each chunk modest. */
export const POSTGREST_IN_CHUNK = 80;

export function chunkIds(ids: string[], size = POSTGREST_IN_CHUNK): string[][] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size));
  }
  return chunks;
}

export async function selectInChunks<T>(
  ids: string[],
  loadChunk: (chunk: string[]) => Promise<T[]>,
  size = POSTGREST_IN_CHUNK,
): Promise<T[]> {
  const chunks = chunkIds(ids, size);
  if (chunks.length === 0) return [];
  const out: T[] = [];
  for (const chunk of chunks) {
    out.push(...(await loadChunk(chunk)));
  }
  return out;
}
