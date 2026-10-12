import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileText, Mail } from 'lucide-react';

import { findRole } from '@/components/careers/roles';
import { Button, buttonClassName, StatusPill } from '@/components/ds';
import { NotesEditor } from '@/components/recruiting/NotesEditor';
import { ResumePreview } from '@/components/recruiting/ResumePreview';
import { StatusSelect } from '@/components/recruiting/StatusSelect';
import {
  formatBytes,
  graduationLabel,
  interestLabel,
  referralSourceLabel,
  schoolYearLabel,
  triedClickLabel,
  weeklyHoursLabel,
} from '@/lib/careers/application';
import { formatDateTime, formatDay, listQuery, parseListParams, statusMeta } from '@/lib/careers/recruiting';
import {
  loadApplication,
  neighbors,
  requireRecruitingAdmin,
  UUID_PATTERN,
  type ApplicationEvent,
} from '@/lib/server/careers';

export const metadata: Metadata = { title: 'Application · Click Admin' };

type Props = {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-surface p-5 sm:p-6 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
      <h3 className="type-headline text-fg">{title}</h3>
      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Item({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="type-meta font-semibold text-fg-tertiary">{label}</dt>
      <dd className="type-body mt-1 min-w-0 text-fg [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function LongText({ text }: { text: string | null }) {
  return text ? (
    <p className="type-reading whitespace-pre-line text-fg">{text}</p>
  ) : (
    <span className="text-fg-tertiary">Not provided</span>
  );
}

const LINK_TOKEN = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;

/** Applicant-typed links: web addresses become https links, anything else stays text. */
function Links({ text }: { text: string | null }) {
  if (!text) return <span className="text-fg-tertiary">Not provided</span>;
  return (
    <ul className="space-y-1">
      {text.split(/\s+/).filter(Boolean).map((token, i) => {
        const href = LINK_TOKEN.test(token) ? (/^https?:\/\//i.test(token) ? token : `https://${token}`) : null;
        return (
          <li key={`${i}-${token}`}>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline-offset-4 hover:underline">
                {token}
              </a>
            ) : (
              token
            )}
          </li>
        );
      })}
    </ul>
  );
}

function eventText(event: ApplicationEvent): string {
  if (event.kind === 'submitted') return 'Application submitted';
  if (event.kind === 'notes_updated') return 'Notes updated';
  return `${statusMeta(event.from_status ?? 'new').label} → ${statusMeta(event.to_status ?? 'new').label}`;
}

/** /admin/recruiting/[id] — one application, its review state and history. */
export default async function ApplicationPage({ params, searchParams }: Props) {
  const { applicationId } = await params;
  if (!UUID_PATTERN.test(applicationId)) notFound();
  const list = parseListParams(await searchParams);
  const admin = await requireRecruitingAdmin();
  if (!admin.ok) redirect('/');

  const [loaded, nav] = await Promise.all([
    loadApplication(admin.supabase, applicationId),
    neighbors(admin.supabase, list, applicationId),
  ]);
  if (!loaded) notFound();
  const { application: a, events } = loaded;
  const role = findRole(a.position);
  const back = `/admin/recruiting${listQuery(list)}`;
  const sibling = (id: string) => `/admin/recruiting/${id}${listQuery(list, { page: 1 })}`;
  const resumeHref = `/admin/recruiting/${a.id}/resume`;
  const isPdf = a.resume_type === 'application/pdf';

  return (
    <div className="space-y-6">
      <nav aria-label="Applications" className="flex items-center justify-between gap-3">
        <Link href={back} className="type-meta inline-flex items-center gap-1.5 font-semibold text-fg-secondary hover:text-fg">
          <ArrowLeft size={16} strokeWidth={2} aria-hidden />
          All applications
        </Link>
        <div className="flex items-center gap-2">
          {nav.index !== null ? (
            <span className="type-meta tabular hidden text-fg-tertiary sm:inline">
              {nav.index + 1} of {nav.total}
            </span>
          ) : null}
          <Button href={nav.previous ? sibling(nav.previous) : '#'} disabled={!nav.previous} size="sm" icon={ChevronLeft} aria-label="Previous application" />
          <Button href={nav.next ? sibling(nav.next) : '#'} disabled={!nav.next} size="sm" icon={ChevronRight} aria-label="Next application" />
        </div>
      </nav>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="type-title-1 font-display text-fg [overflow-wrap:anywhere]">{a.full_name}</h2>
          <p className="type-body mt-1 text-fg-secondary">
            {role?.title ?? a.position} · Applied {formatDateTime(a.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusSelect applicationId={a.id} status={a.status} applicantName={a.full_name} size="md" />
          <Button href={`mailto:${a.email}`} size="md" variant="secondary" icon={Mail}>
            Email
          </Button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Section title="Applicant">
            <Item label="Name">{a.full_name}</Item>
            <Item label="UW email">
              <a href={`mailto:${a.email}`} className="text-accent underline-offset-4 hover:underline">
                {a.email}
              </a>
            </Item>
            <Item label="Year in school">{schoolYearLabel(a.school_year)}</Item>
            <Item label="Major(s)">{a.majors}</Item>
            <Item label="Expected graduation">{graduationLabel(a.graduation_quarter, a.graduation_year)}</Item>
          </Section>

          <Section title="Availability and interests">
            <Item label="Weekly commitment">{weeklyHoursLabel(a.weekly_hours)}</Item>
            <Item label="Earliest start">{formatDay(a.start_date)}</Item>
            <Item label="Areas of interest" wide>
              <span className="flex flex-wrap gap-1.5">
                {a.interests.map((v) => (
                  <StatusPill key={v} variant="neutral">
                    {interestLabel(role, v)}
                  </StatusPill>
                ))}
              </span>
            </Item>
          </Section>

          <Section title="Experience">
            <Item label={role?.pitchPrompt ?? 'What they would bring'} wide>
              <LongText text={a.pitch} />
            </Item>
            <Item label="Relevant experience" wide>
              <LongText text={a.experience} />
            </Item>
            <Item label="Links" wide>
              <Links text={a.links} />
            </Item>
            <Item label="Resume" wide>
              <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-raised p-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-selection text-accent">
                  <FileText size={20} strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="type-body-strong truncate text-fg" title={a.resume_name}>
                    {a.resume_name}
                  </p>
                  <p className="type-meta tabular text-fg-tertiary">
                    {isPdf ? 'PDF' : 'Word document'} · {formatBytes(a.resume_size)}
                  </p>
                </div>
                {/* contents: lets the preview drop below as a full-width row of the card. */}
                <div className="contents">
                  {isPdf ? <ResumePreview src={resumeHref} fileName={a.resume_name} /> : null}
                  {/* A plain link: the route answers with a redirect to storage, not a page. */}
                  <a href={`${resumeHref}?download=1`} className={buttonClassName({ size: 'sm', variant: 'secondary' })}>
                    <Download size={16} strokeWidth={2} aria-hidden />
                    Download
                  </a>
                </div>
              </div>
            </Item>
          </Section>

          <Section title="Additional information">
            <Item label="Tried Click">{triedClickLabel(a.tried_click)}</Item>
            <Item label="Heard about this from">{referralSourceLabel(a.referral_source)}</Item>
            <Item label="Anything else" wide>
              <LongText text={a.additional_info} />
            </Item>
          </Section>
        </div>

        <aside className="min-w-0 space-y-6 xl:sticky xl:top-[calc(var(--topbar-height,56px)+16px)] xl:self-start">
          <section aria-label="Review" className="rounded-lg bg-surface p-5 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
            <NotesEditor applicationId={a.id} notes={a.notes} notesUpdatedAt={a.notes_updated_at} />
          </section>

          <section aria-labelledby="history-heading" className="rounded-lg bg-surface p-5 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
            <h3 id="history-heading" className="type-headline text-fg">
              History
            </h3>
            <ol className="mt-4 space-y-4">
              {events.map((event) => (
                <li key={event.id} className="relative pl-5">
                  <span aria-hidden className="absolute left-0 top-2 size-2 rounded-full bg-fill-strong" />
                  <p className="type-body text-fg">{eventText(event)}</p>
                  <p className="type-meta text-fg-tertiary">
                    {formatDateTime(event.created_at)}
                    {event.kind === 'submitted' ? ' · by the applicant' : event.actor_email ? ` · ${event.actor_email}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
