import type { CareerRole } from "@/components/careers/roles";

/**
 * The careers application: choices, labels and validation shared by the form
 * (components/careers/ApplicationForm), the API (POST /api/careers/applications) and the
 * recruiting dashboard. Plain TypeScript so the form ships no schema library. Field names
 * match the `job_applications` columns (supabase/migrations/20261030000000_job_applications.sql).
 */

type Choice<T extends string = string> = { value: T; label: string };

function choices<const T extends readonly Choice[]>(list: T) {
  return list;
}

export const SCHOOL_YEARS = choices([
  { value: "freshman", label: "Freshman" },
  { value: "sophomore", label: "Sophomore" },
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "graduate", label: "Graduate" },
  { value: "other", label: "Other" },
]);

export const GRADUATION_QUARTERS = choices([
  { value: "autumn", label: "Autumn" },
  { value: "winter", label: "Winter" },
  { value: "spring", label: "Spring" },
  { value: "summer", label: "Summer" },
]);

export const WEEKLY_HOURS = choices([
  { value: "under_5", label: "Less than 5 hours" },
  { value: "5_10", label: "5–10 hours" },
  { value: "10_15", label: "10–15 hours" },
  { value: "15_plus", label: "15+ hours" },
]);

export const TRIED_CLICK = choices([
  { value: "ios_beta", label: "Yes, I'm on the iOS beta" },
  { value: "want_to", label: "Not yet, but I'd like to" },
  { value: "no", label: "No (e.g., I'm on Android)" },
]);

export const REFERRAL_SOURCES = choices([
  { value: "ed_discussion", label: "Ed Discussion" },
  { value: "friend", label: "Friend or classmate" },
  { value: "social_media", label: "Social media" },
  { value: "club", label: "Club or RSO" },
  { value: "other", label: "Other" },
]);

export type SchoolYear = (typeof SCHOOL_YEARS)[number]["value"];
export type GraduationQuarter = (typeof GRADUATION_QUARTERS)[number]["value"];
export type WeeklyHours = (typeof WEEKLY_HOURS)[number]["value"];
export type TriedClick = (typeof TRIED_CLICK)[number]["value"];
export type ReferralSource = (typeof REFERRAL_SOURCES)[number]["value"];

export const PITCH_MAX_WORDS = 200;
export const RESUME_MAX_BYTES = 10 * 1024 * 1024;
/** Also bounds the request body the API reads (the resume plus the text fields). */
export const APPLICATION_MAX_BODY_BYTES = RESUME_MAX_BYTES + 256 * 1024;
export const GRADUATION_YEARS_AHEAD = 7;

export const RESUME_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
export type ResumeExtension = keyof typeof RESUME_TYPES;
export const RESUME_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Honeypot input name: hidden from people, filled in by naive bots. */
export const HONEYPOT_FIELD = "website";

export type ApplicationAnswers = {
  full_name: string;
  email: string;
  school_year: SchoolYear;
  majors: string;
  graduation_quarter: GraduationQuarter;
  graduation_year: number;
  weekly_hours: WeeklyHours;
  start_date: string;
  interests: string[];
  experience: string | null;
  links: string | null;
  pitch: string;
  tried_click: TriedClick;
  referral_source: ReferralSource;
  additional_info: string | null;
};

export type ApplicationField = keyof ApplicationAnswers | "resume";
export type ApplicationErrors = Partial<Record<ApplicationField, string>>;

/** Form order, so the first error can take focus. */
export const APPLICATION_FIELD_ORDER: readonly ApplicationField[] = [
  "full_name",
  "email",
  "school_year",
  "majors",
  "graduation_quarter",
  "graduation_year",
  "weekly_hours",
  "start_date",
  "interests",
  "experience",
  "links",
  "pitch",
  "resume",
  "tried_click",
  "referral_source",
  "additional_info",
];

/** The subset of FormData both the browser and the server provide. */
type FormLike = Pick<FormData, "get" | "getAll">;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Trims, normalizes newlines, and drops control characters Postgres or a reader can't use. */
export function cleanText(value: string, { multiline = false } = {}): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  const stripped = multiline
    ? normalized.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    : normalized.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ");
  return stripped.trim();
}

function labelOf(list: readonly Choice[], value: string): string {
  return list.find((c) => c.value === value)?.label ?? value;
}

export const schoolYearLabel = (v: string) => labelOf(SCHOOL_YEARS, v);
export const weeklyHoursLabel = (v: string) => labelOf(WEEKLY_HOURS, v);
export const triedClickLabel = (v: string) => labelOf(TRIED_CLICK, v);
export const referralSourceLabel = (v: string) => labelOf(REFERRAL_SOURCES, v);
export const interestLabel = (role: CareerRole | undefined, v: string) =>
  role ? labelOf(role.interests, v) : v;
export const graduationLabel = (quarter: string, year: number) =>
  `${labelOf(GRADUATION_QUARTERS, quarter)} ${year}`;

function isChoice<T extends string>(list: readonly Choice<T>[], value: string): value is T {
  return list.some((c) => c.value === value);
}

/** YYYY-MM-DD in the visitor's (or server's) local calendar. */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Graduation years offered: this year through `GRADUATION_YEARS_AHEAD` years out. */
export function graduationYears(now: Date): number[] {
  const first = now.getFullYear();
  return Array.from({ length: GRADUATION_YEARS_AHEAD + 1 }, (_, i) => first + i);
}

/**
 * Validates every answer except the resume. `now` bounds the dates; the server allows a day
 * of slack either way so a visitor's time zone never rejects "today".
 */
export function validateApplication(
  form: FormLike,
  role: CareerRole,
  now: Date,
):
  | { ok: true; value: ApplicationAnswers }
  | { ok: false; errors: ApplicationErrors } {
  const errors: ApplicationErrors = {};
  const text = (name: string) => {
    const raw = form.get(name);
    return typeof raw === "string" ? raw : "";
  };

  const fullName = cleanText(text("full_name"));
  if (!fullName) errors.full_name = "Enter your full name.";
  else if (fullName.length > 120) errors.full_name = "Keep your name under 120 characters.";

  const email = cleanText(text("email")).toLowerCase();
  if (!email) errors.email = "Enter your UW email address.";
  else if (!/^[^@\s]+@uw\.edu$/.test(email) || email.length > 254)
    errors.email = "Use your UW email address, ending in @uw.edu.";

  const schoolYear = text("school_year");
  if (!isChoice(SCHOOL_YEARS, schoolYear)) errors.school_year = "Choose your year in school.";

  const majors = cleanText(text("majors"));
  if (!majors) errors.majors = "Enter your major or intended major.";
  else if (majors.length > 200) errors.majors = "Keep this under 200 characters.";

  const quarter = text("graduation_quarter");
  if (!isChoice(GRADUATION_QUARTERS, quarter)) errors.graduation_quarter = "Choose a quarter.";

  const year = Number(text("graduation_year"));
  const thisYear = now.getFullYear();
  if (!Number.isInteger(year) || year < thisYear - 1 || year > thisYear + GRADUATION_YEARS_AHEAD)
    errors.graduation_year = "Choose a year.";

  const weeklyHours = text("weekly_hours");
  if (!isChoice(WEEKLY_HOURS, weeklyHours)) errors.weekly_hours = "Choose how many hours you can commit.";

  const startDate = text("start_date");
  const yesterday = isoDay(new Date(now.getTime() - 86_400_000));
  const latest = isoDay(new Date(now.getTime() + 2 * 365 * 86_400_000));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate)))
    errors.start_date = "Choose your earliest start date.";
  else if (startDate < yesterday) errors.start_date = "Choose today or a later date.";
  else if (startDate > latest) errors.start_date = "Choose a date within the next two years.";

  const allowed = new Set(role.interests.map((i) => i.value));
  const interests = [...new Set(form.getAll("interests").filter((v): v is string => typeof v === "string"))];
  if (interests.length === 0) errors.interests = "Choose at least one area.";
  else if (interests.some((v) => !allowed.has(v))) errors.interests = "Choose from the listed areas.";

  const experience = cleanText(text("experience"), { multiline: true });
  if (experience.length > 4000) errors.experience = "Keep this under 4,000 characters.";

  const links = cleanText(text("links"), { multiline: true });
  if (links.length > 1000) errors.links = "Keep links under 1,000 characters.";

  const pitch = cleanText(text("pitch"), { multiline: true });
  const pitchWords = countWords(pitch);
  if (!pitchWords) errors.pitch = "Tell us what you'd bring to Click.";
  else if (pitchWords > PITCH_MAX_WORDS)
    errors.pitch = `Trim this to ${PITCH_MAX_WORDS} words (it's ${pitchWords} now).`;
  else if (pitch.length > 2000) errors.pitch = "Keep this under 2,000 characters.";

  const triedClick = text("tried_click");
  if (!isChoice(TRIED_CLICK, triedClick)) errors.tried_click = "Choose an answer.";

  const referral = text("referral_source");
  if (!isChoice(REFERRAL_SOURCES, referral)) errors.referral_source = "Choose how you heard about this.";

  const additional = cleanText(text("additional_info"), { multiline: true });
  if (additional.length > 2000) errors.additional_info = "Keep this under 2,000 characters.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      full_name: fullName,
      email,
      school_year: schoolYear as SchoolYear,
      majors,
      graduation_quarter: quarter as GraduationQuarter,
      graduation_year: year,
      weekly_hours: weeklyHours as WeeklyHours,
      start_date: startDate,
      interests,
      experience: experience || null,
      links: links || null,
      pitch,
      tried_click: triedClick as TriedClick,
      referral_source: referral as ReferralSource,
      additional_info: additional || null,
    },
  };
}

export function resumeExtension(fileName: string): ResumeExtension | null {
  const ext = fileName.toLowerCase().split(".").pop();
  return ext === "pdf" || ext === "doc" || ext === "docx" ? ext : null;
}

/** Size and type checks the browser can make; the server also checks the file's bytes. */
export function validateResume(file: { name: string; size: number } | null): string | null {
  if (!file) return "Attach your resume.";
  if (!resumeExtension(file.name)) return "Upload a PDF or Word document (.pdf, .doc or .docx).";
  if (file.size === 0) return "That file is empty. Choose another.";
  if (file.size > RESUME_MAX_BYTES) return "That file is over 10 MB. Upload a smaller one.";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
