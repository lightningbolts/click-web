import type { Metadata } from "next";
import { Avatar } from "@/components/ds/Avatar";
import { Button } from "@/components/ds/Button";
import { PageHeader } from "@/components/marketing/PageHeader";
import { ABOUT_TEAM } from "@/components/about/team";

export const metadata: Metadata = {
  title: "About Click",
  description:
    "We're University of Washington students building Click so the people you meet in person have a place to stay in touch.",
};

export default function AboutPage() {
  return (
    <div className="container-page flex-1 pb-24">
      <PageHeader
        id="about-heading"
        title="We kept meeting people and losing them"
        lead="We’re five Computer Science students at the University of Washington. After class we kept adding people on Instagram and never talking again. Click is how we stay in touch with the people we actually met."
      >
        <Button href="/#how-it-works" variant="primary" size="lg">
          Try the demo
        </Button>
      </PageHeader>

      <section aria-labelledby="why-heading" className="max-w-[62ch]">
        <h2 id="why-heading" className="type-title-2 text-fg">
          Why we started
        </h2>
        <p className="type-reading mt-3 text-fg-secondary">
          Orientation and Dawg Daze are full of conversations that should continue. A follow is not a plan to get coffee. We
          wanted a record of the room you were in, and a way to find each other the next time you are both free.
        </p>
      </section>

      <section aria-labelledby="team-heading" className="mt-16 md:mt-20">
        <h2 id="team-heading" className="type-title-2 text-fg">
          The team
        </h2>
        <p className="type-reading mt-3 max-w-[62ch] text-fg-secondary">
          We split product, mobile, and web. Campus is the first home for Click because that is where a lot of people start
          over at the same time.
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ABOUT_TEAM.map((member) => (
            <li
              key={member.email}
              className="flex flex-col rounded-lg bg-surface p-6 dark:shadow-[inset_0_0_0_1px_var(--hairline)]"
            >
              <div className="flex items-center gap-4">
                <Avatar seed={member.email} name={member.name} size={56} />
                <div className="min-w-0">
                  <h3 className="type-headline text-fg">{member.name}</h3>
                  <p className="type-meta text-fg-secondary">{member.subtitle}</p>
                </div>
              </div>
              <p className="type-body mt-4 flex-1 text-fg-secondary">{member.text}</p>
              <a
                href={`mailto:${member.email}`}
                className="type-body-strong mt-4 self-start text-accent underline-offset-4 hover:underline"
              >
                {member.email}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
