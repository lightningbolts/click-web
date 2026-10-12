"use client";

import { useId, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, CircleAlert, CircleCheck, FileText, Upload, X } from "lucide-react";
import { Button, Checkbox, InlineNotice, Select, TextArea, TextField } from "@/components/ds";
import type { CareerRole } from "@/components/careers/roles";
import { cn } from "@/lib/cn";
import { useHydrated } from "@/lib/react/useHydrated";
import {
  APPLICATION_FIELD_ORDER,
  countWords,
  formatBytes,
  GRADUATION_QUARTERS,
  graduationYears,
  HONEYPOT_FIELD,
  isoDay,
  PITCH_MAX_WORDS,
  REFERRAL_SOURCES,
  RESUME_ACCEPT,
  SCHOOL_YEARS,
  TRIED_CLICK,
  validateApplication,
  validateResume,
  WEEKLY_HOURS,
  type ApplicationErrors,
  type ApplicationField,
} from "@/lib/careers/application";

const NETWORK_ERROR =
  "We couldn't reach Click. Check your connection and try again. Your answers are still here.";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="rounded-lg bg-surface p-5 sm:p-6 dark:shadow-[inset_0_0_0_1px_var(--hairline)]"
    >
      <h2 id={id} className="type-title-3 font-display">
        {title}
      </h2>
      {description ? <p className="type-meta mt-1 text-fg-secondary">{description}</p> : null}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="type-meta mt-1.5 flex items-center gap-1 text-destructive">
      <CircleAlert size={14} strokeWidth={2} aria-hidden className="shrink-0" />
      {children}
    </p>
  );
}

/** Radio or checkbox list as tappable rows; the native input keeps keyboard and AT behavior. */
function ChoiceGroup({
  legend,
  name,
  type,
  options,
  error,
  columns = 1,
}: {
  legend: string;
  name: ApplicationField;
  type: "radio" | "checkbox";
  options: readonly { value: string; label: string }[];
  error?: string;
  columns?: 1 | 2;
}) {
  const errorId = useId();
  return (
    <fieldset aria-describedby={error ? errorId : undefined} aria-required>
      <legend className="type-meta mb-1.5 font-semibold text-fg-secondary">
        {legend}
        {type === "checkbox" ? <span className="font-normal text-fg-tertiary"> · Choose all that apply</span> : null}
      </legend>
      <div className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2")}>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "type-body flex min-h-11 cursor-pointer items-center gap-3 rounded-md bg-surface-raised px-3.5 py-2.5 text-fg",
              "transition-colors duration-[var(--d-fast)] hover:bg-fill-subtle has-checked:bg-selection",
              error && "shadow-[inset_0_0_0_1px_var(--destructive)]",
            )}
          >
            <Checkbox type={type} name={name} value={option.value} aria-invalid={error ? true : undefined} />
            <span className="min-w-0">{option.label}</span>
          </label>
        ))}
      </div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </fieldset>
  );
}

function ResumeField({
  file,
  error,
  onPick,
  onRemove,
}: {
  file: File | null;
  error?: string;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onPick(dropped);
  };
  const dragProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  };

  return (
    <div>
      <label htmlFor={inputId} className="type-meta mb-1.5 block font-semibold text-fg-secondary">
        Resume or CV
      </label>
      <input
        id={inputId}
        name="resume"
        type="file"
        accept={RESUME_ACCEPT}
        aria-required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : helpId}
        className="peer sr-only"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onPick(picked);
          // Choosing the same file again still fires change.
          e.target.value = "";
        }}
      />
      {file ? (
        <div
          {...dragProps}
          className={cn(
            "flex items-center gap-3 rounded-md bg-surface-raised p-3 peer-focus-visible:shadow-[0_0_0_2px_var(--accent)]",
            dragging && "bg-selection",
          )}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-selection text-accent">
            <FileText size={20} strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="type-body-strong truncate text-fg" title={file.name}>
              {file.name}
            </p>
            <p className="type-meta tabular text-fg-tertiary">{formatBytes(file.size)}</p>
          </div>
          <label
            htmlFor={inputId}
            className="type-meta press cursor-pointer rounded-pill px-3 py-1.5 font-semibold text-accent hover:bg-hover"
          >
            Replace
          </label>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${file.name}`}
            className="press flex size-9 shrink-0 items-center justify-center rounded-full text-fg-secondary hover:bg-hover hover:text-fg"
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          {...dragProps}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-center",
            "transition-colors duration-[var(--d-fast)] peer-focus-visible:shadow-[0_0_0_2px_var(--accent)]",
            dragging
              ? "border-action bg-selection"
              : "border-hairline bg-surface-raised hover:bg-fill-subtle",
            error && !dragging && "border-destructive",
          )}
        >
          <span className="pointer-events-none flex size-11 items-center justify-center rounded-full bg-selection text-accent">
            <Upload size={20} strokeWidth={2} aria-hidden />
          </span>
          <span className="type-body pointer-events-none text-fg">
            <span className="hidden sm:inline">Drop your resume here, or </span>
            <span className="font-semibold text-accent">
              <span className="sm:hidden">Choose a file</span>
              <span className="hidden sm:inline">choose a file</span>
            </span>
          </span>
        </label>
      )}
      {error ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : (
        <p id={helpId} className="type-meta mt-1.5 text-fg-tertiary">
          PDF preferred, Word accepted. Up to 10 MB.
        </p>
      )}
    </div>
  );
}

function focusFirstError(form: HTMLFormElement, errors: ApplicationErrors) {
  const first = APPLICATION_FIELD_ORDER.find((field) => errors[field]);
  if (!first) return;
  const target = form.elements.namedItem(first);
  const el = target instanceof RadioNodeList ? target[0] : target;
  if (el instanceof HTMLElement) el.focus();
}

/** Native careers application (spec: /careers/[roleId]). Fields are uncontrolled so typing never re-renders the form. */
export function ApplicationForm({ role }: { role: CareerRole }) {
  const hydrated = useHydrated();
  const now = hydrated ? new Date() : null;
  const [errors, setErrors] = useState<ApplicationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ name: string; email: string } | null>(null);
  const [resume, setResume] = useState<File | null>(null);
  const [pitchWords, setPitchWords] = useState(0);
  const inFlight = useRef(false);

  const clearError = (field: string) => {
    if (field in errors) {
      setErrors(({ [field as ApplicationField]: _cleared, ...rest }) => rest);
    }
  };

  const pickResume = (file: File) => {
    const problem = validateResume(file);
    if (problem) {
      setErrors((prev) => ({ ...prev, resume: problem }));
      return;
    }
    clearError("resume");
    setResume(file);
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const answers = validateApplication(data, role, new Date());
    const resumeError = validateResume(resume);
    if (!answers.ok || resumeError || !resume) {
      const found: ApplicationErrors = {
        ...(answers.ok ? {} : answers.errors),
        ...(resumeError ? { resume: resumeError } : {}),
      };
      const count = Object.keys(found).length;
      setErrors(found);
      setFormError(count === 1 ? "Check the highlighted answer." : `Check the ${count} highlighted answers.`);
      focusFirstError(form, found);
      return;
    }

    data.set("resume", resume);
    inFlight.current = true;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/careers/applications", { method: "POST", body: data });
      if (res.ok) {
        setSubmitted({ name: answers.value.full_name, email: answers.value.email });
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string; fields?: ApplicationErrors } | null;
      if (body?.fields) {
        setErrors(body.fields);
        focusFirstError(form, body.fields);
      }
      setFormError(body?.error ?? "Something went wrong on our side. Try again.");
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (submitted) {
    const firstName = submitted.name.split(" ")[0];
    return (
      <div className="rounded-lg bg-surface px-5 py-10 text-center sm:px-10 sm:py-14 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-selection text-accent">
          <CircleCheck size={30} strokeWidth={1.75} aria-hidden />
        </span>
        <h2
          ref={(el) => el?.focus()}
          tabIndex={-1}
          className="type-title-2 mt-5 font-display outline-none"
        >
          Application received
        </h2>
        <p className="type-reading mx-auto mt-3 max-w-[46ch] text-fg-secondary">
          Thanks{firstName ? `, ${firstName}` : ""}. The Click team reads every application and will reply to{" "}
          <span className="font-semibold text-fg">{submitted.email}</span>.
        </p>
        <Button href="/careers" variant="secondary" size="lg" icon={ArrowLeft} className="mt-8">
          Back to careers
        </Button>
      </div>
    );
  }

  const error = (field: ApplicationField) => errors[field];

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      onChange={(e) => clearError((e.target as HTMLInputElement).name)}
      aria-busy={submitting || undefined}
      className="space-y-6"
    >
      <p className="type-meta text-fg-tertiary">
        Takes about 10 minutes. Every question is required unless it says optional.
      </p>
      <input type="hidden" name="position" value={role.id} />
      <div aria-hidden className="sr-only">
        <label>
          Leave this empty
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Section title="About you">
        <TextField label="Full name" name="full_name" autoComplete="name" maxLength={120} aria-required error={error("full_name")} />
        <TextField
          label="UW email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@uw.edu"
          maxLength={254}
          aria-required
          error={error("email")}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Select label="Year in school" name="school_year" defaultValue="" aria-required error={error("school_year")}>
            <option value="" disabled>
              Choose…
            </option>
            {SCHOOL_YEARS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <TextField
            label="Major(s) or intended major"
            name="majors"
            maxLength={200}
            aria-required
            error={error("majors")}
          />
        </div>
        <fieldset aria-required>
          <legend className="type-meta mb-1.5 font-semibold text-fg-secondary">Expected graduation</legend>
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            <Select label="Quarter" hideLabel name="graduation_quarter" defaultValue="" error={error("graduation_quarter")}>
              <option value="" disabled>
                Quarter
              </option>
              {GRADUATION_QUARTERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Select label="Year" hideLabel name="graduation_year" defaultValue="" error={error("graduation_year")}>
              <option value="" disabled>
                Year
              </option>
              {now
                ? graduationYears(now).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))
                : null}
            </Select>
          </div>
        </fieldset>
      </Section>

      <Section title="Availability and interests">
        <ChoiceGroup
          legend="Weekly commitment"
          name="weekly_hours"
          type="radio"
          options={WEEKLY_HOURS}
          columns={2}
          error={error("weekly_hours")}
        />
        <TextField
          label="Earliest start date"
          name="start_date"
          type="date"
          min={now ? isoDay(now) : undefined}
          aria-required
          error={error("start_date")}
          className="sm:max-w-[calc(50%-10px)]"
        />
        <ChoiceGroup
          legend="Areas of interest"
          name="interests"
          type="checkbox"
          options={role.interests}
          columns={2}
          error={error("interests")}
        />
      </Section>

      <Section title="Experience">
        <TextArea
          label={
            <>
              Relevant experience <span className="font-normal text-fg-tertiary">(optional)</span>
            </>
          }
          name="experience"
          maxLength={4000}
          help="Clubs, jobs, content you've made, events you've run."
          error={error("experience")}
        />
        <TextArea
          label={
            <>
              Social media, portfolio, or content links <span className="font-normal text-fg-tertiary">(optional)</span>
            </>
          }
          name="links"
          maxLength={1000}
          help="One per line."
          inputClassName="min-h-20"
          error={error("links")}
        />
        <TextArea
          label={role.pitchPrompt}
          name="pitch"
          maxLength={2000}
          aria-required
          help={`Up to ${PITCH_MAX_WORDS} words.`}
          count={`${pitchWords}/${PITCH_MAX_WORDS} words`}
          onChange={(e) => setPitchWords(countWords(e.target.value))}
          error={error("pitch") ?? (pitchWords > PITCH_MAX_WORDS ? `That's ${pitchWords - PITCH_MAX_WORDS} words over the limit.` : undefined)}
        />
        <ResumeField
          file={resume}
          error={error("resume")}
          onPick={pickResume}
          onRemove={() => setResume(null)}
        />
      </Section>

      <Section title="A little more">
        <ChoiceGroup legend="Have you tried Click?" name="tried_click" type="radio" options={TRIED_CLICK} error={error("tried_click")} />
        <ChoiceGroup
          legend="How did you hear about this opportunity?"
          name="referral_source"
          type="radio"
          options={REFERRAL_SOURCES}
          columns={2}
          error={error("referral_source")}
        />
        <TextArea
          label={
            <>
              Anything else you&apos;d like us to know? <span className="font-normal text-fg-tertiary">(optional)</span>
            </>
          }
          name="additional_info"
          maxLength={2000}
          error={error("additional_info")}
        />
      </Section>

      <div className="space-y-4">
        {formError ? (
          <div role="alert">
            <InlineNotice variant="destructive">{formError}</InlineNotice>
          </div>
        ) : null}
        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="type-meta max-w-[46ch] text-fg-tertiary">
            Only the Click team can see your application. Your resume is stored privately.
          </p>
          <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full sm:w-auto">
            Submit application
          </Button>
        </div>
        {submitting ? (
          <p role="status" className="sr-only">
            Submitting your application…
          </p>
        ) : null}
      </div>
    </form>
  );
}
