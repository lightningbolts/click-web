import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight, Inbox, SearchX } from 'lucide-react';

import { findRole, OPEN_ROLES } from '@/components/careers/roles';
import { Button, EmptyState } from '@/components/ds';
import { ListControls } from '@/components/recruiting/ListControls';
import { StatusSelect } from '@/components/recruiting/StatusSelect';
import { cn } from '@/lib/cn';
import { interestLabel, schoolYearLabel, weeklyHoursLabel } from '@/lib/careers/application';
import {
  APPLICATION_STATUSES,
  formatDate,
  listQuery,
  PAGE_SIZE,
  parseListParams,
  type ListParams,
} from '@/lib/careers/recruiting';
import { listApplications, requireRecruitingAdmin, statusCounts, type ApplicationListRow } from '@/lib/server/careers';

export const metadata: Metadata = { title: 'Recruiting · Click Admin' };

type SearchParams = Record<string, string | string[] | undefined>;

function Interests({ values, role }: { values: string[]; role: ReturnType<typeof findRole> }) {
  const labels = values.map((v) => interestLabel(role, v)).join(', ');
  return (
    <span className="type-meta line-clamp-2 text-fg-secondary" title={labels}>
      {labels}
    </span>
  );
}

function Stat({ label, value, href, active }: { label: string; value: number; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'block rounded-lg p-4 transition-colors duration-[var(--d-fast)]',
        active
          ? 'bg-selection text-accent'
          : 'bg-surface hover:bg-[color-mix(in_srgb,var(--surface)_94%,var(--text)_6%)] dark:shadow-[inset_0_0_0_1px_var(--hairline)]',
      )}
    >
      <span className={cn('type-meta block', active ? 'text-accent' : 'text-fg-tertiary')}>{label}</span>
      <span className={cn('type-title-3 tabular mt-1 block', active ? 'text-accent' : 'text-fg')}>{value}</span>
    </Link>
  );
}

function detailHref(row: ApplicationListRow, params: ListParams) {
  return `/admin/recruiting/${row.id}${listQuery(params, { page: 1 })}`;
}

/** /admin/recruiting — every application for a role, filtered and paged on the server. */
export default async function RecruitingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = parseListParams(await searchParams);
  const admin = await requireRecruitingAdmin();
  if (!admin.ok) redirect('/');

  const role = findRole(params.role);
  const [{ rows, total }, counts] = await Promise.all([
    listApplications(admin.supabase, params),
    statusCounts(admin.supabase, params.role),
  ]);
  const allCount = [...counts.values()].reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (rows.length === 0 && params.page > pages) redirect(`/admin/recruiting${listQuery(params, { page: pages })}`);
  const filtered = Boolean(params.q || params.status || params.year || params.interest || params.hours);
  const first = (params.page - 1) * PAGE_SIZE + 1;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="type-title-1 font-display text-fg">Recruiting</h2>
          <p className="type-body mt-1 text-fg-secondary">
            {role?.title ?? params.role} applications
          </p>
        </div>
        {OPEN_ROLES.length > 1 ? (
          <nav aria-label="Roles" className="flex flex-wrap gap-2">
            {OPEN_ROLES.map((r) => (
              <Button
                key={r.id}
                href={`/admin/recruiting${listQuery({ ...params, role: r.id }, { page: 1, status: '' })}`}
                size="sm"
                variant={r.id === params.role ? 'tinted' : 'secondary'}
              >
                {r.title}
              </Button>
            ))}
          </nav>
        ) : null}
      </header>

      <nav aria-label="Applications by status" className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-7">
        <Stat label="Total" value={allCount} href={`/admin/recruiting${listQuery(params, { status: '', page: 1 })}`} active={!params.status} />
        {APPLICATION_STATUSES.map((s) => (
          <Stat
            key={s.value}
            label={s.label}
            value={counts.get(s.value) ?? 0}
            href={`/admin/recruiting${listQuery(params, { status: s.value, page: 1 })}`}
            active={params.status === s.value}
          />
        ))}
      </nav>

      <section aria-labelledby="applications-heading" className="rounded-lg bg-surface p-4 sm:p-5 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="applications-heading" className="type-headline text-fg">
            Applications
          </h3>
          {filtered ? (
            <Link href={`/admin/recruiting${listQuery({ ...params, q: '', status: '', year: '', interest: '', hours: '' })}`} className="type-meta font-semibold text-accent hover:underline">
              Clear filters
            </Link>
          ) : null}
        </div>
        <div className="mt-4">
          <ListControls params={params} interests={role?.interests ?? []} />
        </div>

        {rows.length === 0 ? (
          filtered ? (
            <EmptyState icon={SearchX} headingLevel="h3" title="No matching applications" body="Try a different search or clear the filters." />
          ) : (
            <EmptyState icon={Inbox} headingLevel="h3" title="No applications yet" body="New applications from the careers page show up here." />
          )
        ) : (
          <>
            {/* Up to laptop width (the admin sidebar takes room): one card per applicant. */}
            <ul className="mt-4 divide-y divide-hairline xl:hidden">
              {rows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 py-3">
                  <Link href={detailHref(row, params)} className="min-w-0 flex-1">
                    <span className="type-body-strong block truncate text-fg">{row.full_name}</span>
                    <span className="type-meta block truncate text-fg-secondary">{row.email}</span>
                    <span className="type-meta mt-1 block text-fg-tertiary">
                      {schoolYearLabel(row.school_year)} · {row.majors} · {weeklyHoursLabel(row.weekly_hours)} · {formatDate(row.created_at)}
                    </span>
                    <span className="mt-1 block">
                      <Interests values={row.interests} role={role} />
                    </span>
                  </Link>
                  <StatusSelect applicationId={row.id} status={row.status} applicantName={row.full_name} />
                </li>
              ))}
            </ul>

            {/* Laptops and up: a table that scrolls sideways if it must. */}
            <div className="relative -mx-4 mt-4 hidden overflow-x-auto px-4 sm:-mx-5 sm:px-5 xl:block">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <caption className="sr-only">
                  {role?.title ?? params.role} applications, {LIST_SORT_CAPTION[params.sort]}
                </caption>
                <thead>
                  <tr className="type-meta border-b border-hairline text-fg-tertiary">
                    <th scope="col" className="py-2 pr-3 font-semibold">Applicant</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Year</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Major</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Availability</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Interests</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Status</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Applied</th>
                    <th scope="col" className="py-2 font-semibold"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="type-body">
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-hairline last:border-0 hover:bg-hover">
                      <td className="max-w-48 py-3 pr-3">
                        <Link href={detailHref(row, params)} className="type-body-strong block truncate text-fg hover:text-accent">
                          {row.full_name}
                        </Link>
                        <span className="type-meta block truncate text-fg-secondary">{row.email}</span>
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap text-fg-secondary">{schoolYearLabel(row.school_year)}</td>
                      <td className="max-w-32 py-3 pr-3 text-fg-secondary">
                        <span className="line-clamp-2" title={row.majors}>{row.majors}</span>
                      </td>
                      <td className="max-w-28 py-3 pr-3 text-fg-secondary">{weeklyHoursLabel(row.weekly_hours)}</td>
                      <td className="max-w-48 py-3 pr-3">
                        <Interests values={row.interests} role={role} />
                      </td>
                      <td className="py-3 pr-3">
                        <StatusSelect applicationId={row.id} status={row.status} applicantName={row.full_name} />
                      </td>
                      <td className="type-meta tabular py-3 pr-3 whitespace-nowrap text-fg-secondary">{formatDate(row.created_at)}</td>
                      <td className="py-3 text-right">
                        <Button href={detailHref(row, params)} size="sm" variant="plain" icon={ChevronRight} aria-label={`View ${row.full_name}'s application`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-4">
              <p className="type-meta tabular text-fg-tertiary">
                {first}–{first + rows.length - 1} of {total}
              </p>
              <div className="flex gap-2">
                <Button
                  href={`/admin/recruiting${listQuery(params, { page: params.page - 1 })}`}
                  size="sm"
                  icon={ChevronLeft}
                  disabled={params.page <= 1}
                  aria-label="Previous page"
                >
                  <span className="hidden sm:inline">Previous</span>
                </Button>
                <Button
                  href={`/admin/recruiting${listQuery(params, { page: params.page + 1 })}`}
                  size="sm"
                  trailingIcon={ChevronRight}
                  disabled={params.page >= pages}
                  aria-label="Next page"
                >
                  <span className="hidden sm:inline">Next</span>
                </Button>
              </div>
            </nav>
          </>
        )}
      </section>
    </div>
  );
}

const LIST_SORT_CAPTION: Record<ListParams['sort'], string> = {
  newest: 'newest first',
  oldest: 'oldest first',
  name: 'by name A to Z',
  name_desc: 'by name Z to A',
};
