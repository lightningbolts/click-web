'use server';

import { revalidatePath } from 'next/cache';

import { isApplicationStatus } from '@/lib/careers/recruiting';
import { requireRecruitingAdmin, UUID_PATTERN } from '@/lib/server/careers';

/** Recruiting review actions. The RPCs re-check the admin role and compare-and-set. */

export type ReviewResult = { ok: true; at: string } | { ok: false; error: string; conflict?: boolean };

const NOTES_MAX = 10_000;

function failure(error: { code?: string; message: string }): ReviewResult {
  if (error.code === 'PT409') {
    return { ok: false, conflict: true, error: 'Someone else changed this application. Showing the latest.' };
  }
  if (error.code === 'P0002') return { ok: false, error: 'This application no longer exists.' };
  if (error.code === '42501') return { ok: false, error: 'Your admin access has changed. Sign in again.' };
  console.error('Recruiting update failed:', error.message);
  return { ok: false, error: 'Could not save. Check your connection and try again.' };
}

function done(at: string): ReviewResult {
  revalidatePath('/admin/recruiting', 'layout');
  return { ok: true, at };
}

export async function setApplicationStatusAction(
  applicationId: string,
  from: string,
  to: string,
): Promise<ReviewResult> {
  if (!UUID_PATTERN.test(applicationId) || !isApplicationStatus(from) || !isApplicationStatus(to)) {
    return { ok: false, error: 'Invalid request.' };
  }
  const admin = await requireRecruitingAdmin();
  if (!admin.ok) return { ok: false, error: 'Admin role required.' };

  const { data, error } = await admin.supabase.rpc('set_job_application_status', {
    p_application_id: applicationId,
    p_from: from,
    p_to: to,
  });
  return error ? failure(error) : done(String(data));
}

export async function saveApplicationNotesAction(
  applicationId: string,
  notes: string,
  expectedUpdatedAt: string | null,
): Promise<ReviewResult> {
  if (
    !UUID_PATTERN.test(applicationId) ||
    typeof notes !== 'string' ||
    (expectedUpdatedAt !== null && Number.isNaN(Date.parse(expectedUpdatedAt)))
  ) {
    return { ok: false, error: 'Invalid request.' };
  }
  // Postgres text can't hold NUL; everything else is kept as typed.
  const clean = notes.replace(/\u0000/g, '').replace(/\r\n?/g, '\n');
  if (clean.length > NOTES_MAX) return { ok: false, error: 'Notes can be up to 10,000 characters.' };

  const admin = await requireRecruitingAdmin();
  if (!admin.ok) return { ok: false, error: 'Admin role required.' };

  const { data, error } = await admin.supabase.rpc('set_job_application_notes', {
    p_application_id: applicationId,
    p_notes: clean,
    p_expected_notes_updated_at: expectedUpdatedAt,
  });
  return error ? failure(error) : done(String(data));
}
