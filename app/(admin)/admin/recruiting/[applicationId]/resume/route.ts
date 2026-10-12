import { NextResponse, type NextRequest } from 'next/server';

import { RESUME_BUCKET, requireRecruitingAdmin, UUID_PATTERN } from '@/lib/server/careers';

const SIGNED_URL_SECONDS = 60;
const NO_STORE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

/**
 * Admin-only resume access: mints a one-minute signed URL as the signed-in admin (storage RLS
 * re-checks the role) and redirects to it. `?download=1` saves it under the original name;
 * otherwise PDFs open inline for the preview.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const admin = await requireRecruitingAdmin();
  if (!admin.ok) return new NextResponse('Not found', { status: 404, headers: NO_STORE });
  if (!UUID_PATTERN.test(applicationId)) return new NextResponse('Not found', { status: 404, headers: NO_STORE });

  const { data: application } = await admin.supabase
    .from('job_applications')
    .select('resume_path, resume_name')
    .eq('id', applicationId)
    .maybeSingle();
  if (!application) return new NextResponse('Not found', { status: 404, headers: NO_STORE });

  const download = request.nextUrl.searchParams.get('download') === '1';
  const { data, error } = await admin.supabase.storage
    .from(RESUME_BUCKET)
    .createSignedUrl(application.resume_path, SIGNED_URL_SECONDS, download ? { download: application.resume_name } : undefined);
  if (error || !data?.signedUrl) {
    console.error('Resume signing failed:', error?.message);
    return new NextResponse('Resume unavailable', { status: 502, headers: NO_STORE });
  }
  return NextResponse.redirect(data.signedUrl, { status: 303, headers: NO_STORE });
}
