import { NextResponse } from 'next/server';
import { ticketingEnabled } from '@/lib/server/ticketing/flags';
export { publicRoute } from '@/lib/server/withAuth';
export const dynamic = 'force-dynamic';
export function GET() {
  return NextResponse.json(
    { enabled: ticketingEnabled() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
