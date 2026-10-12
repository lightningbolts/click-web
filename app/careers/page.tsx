import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { PageHeader } from "@/components/marketing/PageHeader";
import { OPEN_ROLES } from "@/components/careers/roles";

export const metadata: Metadata = {
  title: "Careers at Click",
  description:
    "Join the University of Washington students building Click. See open roles and apply.",
};

export default function CareersPage() {
  return (
    <div className="container-page flex-1 pb-24">
      <PageHeader
        id="careers-heading"
        title="Work on Click"
        lead="We’re a small team of UW students building a better way to stay in touch with the people you meet in person. If that sounds like something you want to grow, we’d love to hear from you."
      />

      <section aria-labelledby="open-roles" className="max-w-3xl">
        <h2 id="open-roles" className="type-title-2 text-fg">
          Open roles
        </h2>

        {OPEN_ROLES.length === 0 ? (
          <p className="type-reading mt-3 text-fg-secondary">
            No open roles right now. Check back soon.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-4">
            {OPEN_ROLES.map((role) => (
              <li
                key={role.id}
                id={role.id}
                className="rounded-lg bg-surface p-6 md:p-8 dark:shadow-[inset_0_0_0_1px_var(--hairline)]"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="type-title-3 text-fg">{role.title}</h3>
                    <p className="type-meta mt-1 text-fg-secondary">
                      {role.team} · {role.location} · {role.type}
                    </p>
                  </div>
                  <Button
                    href={`/careers/${role.id}`}
                    aria-label={`Apply for ${role.title}`}
                    variant="primary"
                    size="lg"
                    trailingIcon={ArrowRight}
                  >
                    Apply
                  </Button>
                </div>

                <p className="type-reading mt-6 text-fg-secondary">
                  {role.summary}
                </p>

                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="type-headline text-fg">What you will do</h4>
                    <ul className="type-body mt-2 list-disc space-y-1 pl-5 text-fg-secondary">
                      {role.responsibilities.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="type-headline text-fg">
                      Who we are looking for
                    </h4>
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
  );
}
