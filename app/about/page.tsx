import type { Metadata } from "next";
import Link from "next/link";
import { CardVisual } from "@/components/ds/CardVisual";
import { ABOUT_TEAM } from "@/components/about/team";

export const metadata: Metadata = {
  title: "About Click",
  description:
    "We're University of Washington students building Click so the people you meet in person have a place to stay in touch.",
};

export default function AboutPage() {
  return (
    <div className="flex-1 py-20">
      <div className="container-page">
          <h1
            id="about-heading"
            data-testid="about-heading"
            className="mkt-page-title text-center text-5xl font-bold md:text-6xl"
          >
          About <span className="text-accent">Click</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-relaxed text-fg-secondary">
          We&apos;re five Computer Science students at the University of Washington. After class we
          kept adding people on Instagram and never talking again. Click is how we stay in touch
          with the people we actually met.
        </p>
        <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-relaxed text-fg-secondary">
          See how it works and join the waitlist on the{" "}
          <Link href="/" className="font-medium text-accent underline-offset-4 hover:underline">
            homepage
          </Link>
          .
        </p>

        <section className="mt-16">
          <h2 className="text-center text-3xl font-bold md:text-4xl">Why we started</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center leading-relaxed text-fg-secondary">
            Orientation and Dawg Daze are full of conversations that should continue. A follow is
            not a plan to get coffee. We wanted a record of the room you were in, and a way to find
            each other the next time you are both free.
          </p>
        </section>

        <section className="mt-20">
          <h2 className="text-center text-3xl font-bold md:text-4xl">
            Meet the <span className="text-accent">team</span>
          </h2>
          <p className="mx-auto mt-4 mb-12 max-w-2xl text-center text-fg-secondary">
            We split product, mobile, and web. Campus is the first home for Click because that is
            where a lot of people start over at the same time.
          </p>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {ABOUT_TEAM.map((member) => (
              <div key={member.email} className="rounded-lg bg-surface p-8 text-center dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
                <div className="mx-auto mb-6 h-24 w-24 overflow-hidden rounded-full">
                  <CardVisual seed={member.email} radius={0} className="flex size-24 items-center justify-center">
                    <span className="font-display text-4xl font-extrabold text-white">{member.initials}</span>
                  </CardVisual>
                </div>
                <h3 className="text-2xl font-bold">{member.name}</h3>
                <p className="mt-2 text-fg-secondary">{member.subtitle}</p>
                <p className="mt-4 text-left text-sm leading-relaxed text-fg-secondary">{member.text}</p>
                <a href={`mailto:${member.email}`} className="mt-4 inline-block text-sm text-accent hover:underline">
                  {member.email}
                </a>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
