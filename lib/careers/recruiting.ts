import type { StatusPillVariant } from "@/components/ds/StatusPill";
import { OPEN_ROLES } from "@/components/careers/roles";
import { SCHOOL_YEARS, WEEKLY_HOURS } from "@/lib/careers/application";

/**
 * Recruiting dashboard (/admin/recruiting): review statuses and the list's URL parameters.
 * Shared by the server pages and the client controls; statuses match the
 * `job_applications.status` check constraint.
 */

export const APPLICATION_STATUSES = [
  { value: "new", label: "New", variant: "tinted" },
  { value: "under_review", label: "Under review", variant: "neutral" },
  { value: "shortlisted", label: "Shortlisted", variant: "warning" },
  { value: "interview", label: "Interview", variant: "warning" },
  { value: "accepted", label: "Accepted", variant: "success" },
  { value: "rejected", label: "Rejected", variant: "destructive" },
] as const satisfies readonly { value: string; label: string; variant: StatusPillVariant }[];

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]["value"];

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return APPLICATION_STATUSES.some((s) => s.value === value);
}

export function statusMeta(status: string) {
  return APPLICATION_STATUSES.find((s) => s.value === status) ?? APPLICATION_STATUSES[0];
}

export const LIST_SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
] as const;
export type ListSort = (typeof LIST_SORTS)[number]["value"];

export const PAGE_SIZE = 25;

export type ListParams = {
  role: string;
  q: string;
  status: ApplicationStatus | "";
  year: string;
  interest: string;
  hours: string;
  sort: ListSort;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export const DEFAULT_ROLE = OPEN_ROLES[0]?.id ?? "marketing-intern";

/** Unknown values fall back to "any", so a hand-edited URL never errors. */
export function parseListParams(raw: RawParams): ListParams {
  const role = one(raw.role);
  const status = one(raw.status);
  const year = one(raw.year);
  const hours = one(raw.hours);
  const sort = one(raw.sort);
  const page = Number.parseInt(one(raw.page), 10);
  return {
    role: /^[a-z0-9-]{1,64}$/.test(role) ? role : DEFAULT_ROLE,
    // Names and emails only: letters, digits, spaces and . @ ' + - (safe inside a PostgREST filter).
    q: one(raw.q).replace(/[^\p{L}\p{N} .@'+-]/gu, "").trim().slice(0, 100),
    status: isApplicationStatus(status) ? status : "",
    year: SCHOOL_YEARS.some((y) => y.value === year) ? year : "",
    interest: /^[a-z0-9_]{1,40}$/.test(one(raw.interest)) ? one(raw.interest) : "",
    hours: WEEKLY_HOURS.some((h) => h.value === hours) ? hours : "",
    sort: LIST_SORTS.some((s) => s.value === sort) ? (sort as ListSort) : "newest",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** The query string for `params` with `patch` applied, omitting defaults. */
export function listQuery(params: ListParams, patch: Partial<ListParams> = {}): string {
  const next = { ...params, ...patch };
  const search = new URLSearchParams();
  if (next.role !== DEFAULT_ROLE) search.set("role", next.role);
  if (next.q) search.set("q", next.q);
  if (next.status) search.set("status", next.status);
  if (next.year) search.set("year", next.year);
  if (next.interest) search.set("interest", next.interest);
  if (next.hours) search.set("hours", next.hours);
  if (next.sort !== "newest") search.set("sort", next.sort);
  if (next.page > 1) search.set("page", String(next.page));
  const query = search.toString();
  return query ? `?${query}` : "";
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Los_Angeles",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
});

/** Seattle calendar dates: the team and applicants are at UW. */
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
/** A `date` column ("2026-11-02") is a calendar day, not an instant. */
export const formatDay = (day: string) => dateFormat.format(new Date(`${day}T12:00:00-08:00`));
