import { NextResponse } from 'next/server';
import { loadSessionBootstrap } from '@/lib/server/session';

/** GET /api/me/shell — the signed-in shell bootstrap (unread total, activity dot, Places). */
export async function GET(): Promise<Response> {
  const bootstrap = await loadSessionBootstrap();
  if (!bootstrap) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(bootstrap, { headers: { 'Cache-Control': 'private, no-store' } });
}
