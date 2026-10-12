import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';

import type { ApplicationAnswers } from '@/lib/careers/application';
import { PAGE_SIZE, type ApplicationStatus, type ListParams } from '@/lib/careers/recruiting';
import { isAdminUser } from '@/lib/server/adminRole';
import { createSupabaseServerClient } from '@/lib/server/supabaseServer';

/** Private bucket (migration 20261030000000): the service role writes, admins read through signed URLs. */
export const RESUME_BUCKET = 'job-application-resumes';

/**
 * Recruiting reads and writes run as the signed-in admin, not the service role, so the
 * database's admin-only RLS and RPC checks apply on top of this one.
 */
export async function requireRecruitingAdmin(): Promise<
  { ok: true; supabase: SupabaseClient; user: User } | { ok: false }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !isAdminUser(user)) return { ok: false };
  return { ok: true, supabase, user };
}

export type ApplicationListRow = Pick<
  ApplicationAnswers,
  'full_name' | 'email' | 'school_year' | 'majors' | 'weekly_hours' | 'interests'
> & { id: string; status: ApplicationStatus; created_at: string };

export type ApplicationDetail = ApplicationAnswers & {
  id: string;
  position: string;
  status: ApplicationStatus;
  notes: string;
  notes_updated_at: string | null;
  resume_name: string;
  resume_type: string;
  resume_size: number;
  created_at: string;
};

export type ApplicationEvent = {
  id: number;
  kind: 'submitted' | 'status_changed' | 'notes_updated';
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus | null;
  actor_email: string | null;
  created_at: string;
};

const LIST_COLUMNS = 'id, full_name, email, school_year, majors, weekly_hours, interests, status, created_at';
const DETAIL_COLUMNS =
  'id, position, full_name, email, school_year, majors, graduation_quarter, graduation_year, weekly_hours, start_date, ' +
  'interests, experience, links, pitch, tried_click, referral_source, additional_info, resume_name, resume_type, ' +
  'resume_size, created_at, status, notes, notes_updated_at';

/** The list's filters and sort; shared by the page and the detail view's previous/next. */
function filteredQuery(
  supabase: SupabaseClient,
  columns: string,
  params: ListParams,
  options?: { count: 'exact'; head?: boolean },
) {
  let q = supabase.from('job_applications').select(columns, options).eq('position', params.role);
  if (params.status) q = q.eq('status', params.status);
  if (params.year) q = q.eq('school_year', params.year);
  if (params.hours) q = q.eq('weekly_hours', params.hours);
  if (params.interest) q = q.contains('interests', [params.interest]);
  // parseListParams limits `q` to characters that are safe inside a quoted filter value.
  if (params.q) q = q.or(`full_name.ilike."*${params.q}*",email.ilike."*${params.q}*"`);
  const byName = params.sort === 'name' || params.sort === 'name_desc';
  const ascending = params.sort === 'oldest' || params.sort === 'name';
  return q.order(byName ? 'full_name' : 'created_at', { ascending }).order('id', { ascending });
}

export async function listApplications(supabase: SupabaseClient, params: ListParams) {
  const from = (params.page - 1) * PAGE_SIZE;
  const { data, count, error, status } = await filteredQuery(supabase, LIST_COLUMNS, params, { count: 'exact' }).range(
    from,
    from + PAGE_SIZE - 1,
  );
  // PostgREST answers 416 for an offset past the end (supabase-js loses the error body).
  if (error && status === 416) {
    // Past the last page (an old link, or the list shrank): report the real total so the page can redirect.
    const head = await filteredQuery(supabase, 'id', params, { count: 'exact', head: true });
    if (head.error) throw new Error(`Could not load applications: ${head.error.message}`);
    return { rows: [] as ApplicationListRow[], total: head.count ?? 0 };
  }
  if (error) throw new Error(`Could not load applications: ${error.message}`);
  return { rows: (data ?? []) as unknown as ApplicationListRow[], total: count ?? 0 };
}

export async function statusCounts(supabase: SupabaseClient, position: string) {
  const { data, error } = await supabase.rpc('job_application_status_counts', { p_position: position });
  if (error) throw new Error(`Could not load counts: ${error.message}`);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { status: string; total: number }[]) counts.set(row.status, Number(row.total));
  return counts;
}

/** Previous and next application ids in the list's order (ids only; capped for safety). */
export async function neighbors(supabase: SupabaseClient, params: ListParams, id: string) {
  const { data } = await filteredQuery(supabase, 'id', params).limit(2000);
  const ids = ((data ?? []) as unknown as { id: string }[]).map((r) => r.id);
  const index = ids.indexOf(id);
  if (index < 0) return { previous: null, next: null, index: null, total: ids.length };
  return { previous: ids[index - 1] ?? null, next: ids[index + 1] ?? null, index, total: ids.length };
}

export async function loadApplication(supabase: SupabaseClient, id: string) {
  const [application, events] = await Promise.all([
    supabase.from('job_applications').select(DETAIL_COLUMNS).eq('id', id).maybeSingle(),
    supabase
      .from('job_application_events')
      .select('id, kind, from_status, to_status, actor_email, created_at')
      .eq('application_id', id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
  ]);
  if (application.error) throw new Error(`Could not load the application: ${application.error.message}`);
  if (!application.data) return null;
  return {
    application: application.data as unknown as ApplicationDetail,
    events: (events.data ?? []) as ApplicationEvent[],
  };
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
