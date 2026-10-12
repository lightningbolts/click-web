import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { buttonClassName } from "@/components/ds/Button";
import { OPEN_ROLES } from "@/components/careers/roles";

export const metadata: Metadata = {
  title: "Careers at Click",
  description:
    "Join the University of Washington students building Click. See open roles and apply.",
};

export default function CareersPage() {
  return (
    <div className="flex-1 py-20">
      <div className="container-page">
        <h1
          id="careers-heading"
          data-testid="careers-heading"
          className="mkt-page-title text-center text-5xl font-bold md:text-6xl"
        >
          Work on <span className="text-accent">Click</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-relaxed text-fg-secondary">
          We are a small team of UW students building a better way to stay in touch with the
          people you meet in person. If that sounds like something you want to grow, we would
          love to hear from you.
        </p>

        <section aria-labelledby="open-roles" className="mx-auto mt-16 max-w-3xl">
          <h2 id="open-roles" className="type-title-2 font-display">
            Open roles
          </h2>

          {OPEN_ROLES.length === 0 ? (
            <p className="mt-4 text-fg-secondary">
              No open roles right now. Check back soon.
            </p>
          ) : (
            <ul className="mt-6 space-y-6">
              {OPEN_ROLES.map((role) => (
                <li
                  key={role.id}
                  id={role.id}
                  className="rounded-lg bg-surface p-6 md:p-8 dark:shadow-[inset_0_0_0_1px_var(--hairline)]"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="type-title-3 font-display">{role.title}</h3>
                      <p className="type-meta mt-1 text-fg-secondary">
                        {role.team} · {role.location} · {role.type}
                      </p>
                    </div>
                    <a
                      href={role.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Apply for ${role.title} (opens Google Form in a new tab)`}
                      className={buttonClassName({ variant: "primary", size: "lg" })}
                    >
                      <span className="inline-flex items-center gap-2">
                        Apply
                        <ArrowUpRight size={18} strokeWidth={2} aria-hidden />
                      </span>
                    </a>
                  </div>

                  <p className="type-reading mt-6 text-fg-secondary">{role.summary}</p>

                  <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <div>
                      <h4 className="type-headline">What you will do</h4>
                      <ul className="type-body mt-2 list-disc space-y-1 pl-5 text-fg-secondary">
                        {role.responsibilities.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="type-headline">Who we are looking for</h4>
                      <ul className="type-body mt-2 list-disc space-y-1 pl-5 text-fg-secondary">
                        {role.lookingFor.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
