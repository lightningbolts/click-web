import type { Metadata } from "next";
import Link from "next/link";
import { FcCard, FcPageShell } from "@/components/fc";
import { CardVisualHero } from "@/components/ui/CardVisualSurface";
import { ABOUT_TEAM } from "@/components/about/team";
import { PAGE_COLUMN_CLASS } from "@/lib/shell/pageColumn";

export const metadata: Metadata = {
  title: "About Click",
  description:
    "We're University of Washington students building Click so the people you meet in person have a place to stay in touch.",
};

export default function AboutPage() {
  return (
    <FcPageShell className="py-20">
      <div className={PAGE_COLUMN_CLASS}>
          <h1
            id="about-heading"
            data-testid="about-heading"
            className="mkt-page-title text-center text-5xl font-bold md:text-6xl"
          >
          About <span className="text-primary">Click</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-relaxed text-on-surface-variant">
          We&apos;re five Computer Science students at the University of Washington. After class we
          kept adding people on Instagram and never talking again. Click is how we stay in touch
          with the people we actually met.
        </p>
        <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-relaxed text-on-surface-variant">
          See how it works and join the waitlist on the{" "}
          <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
            homepage
          </Link>
          .
        </p>

        <section className="mt-16">
          <h2 className="text-center text-3xl font-bold md:text-4xl">Why we started</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center leading-relaxed text-on-surface-variant">
            Orientation and Dawg Daze are full of conversations that should continue. A follow is
            not a plan to get coffee. We wanted a record of the room you were in, and a way to find
            each other the next time you are both free.
          </p>
        </section>

        <section className="mt-20">
          <h2 className="text-center text-3xl font-bold md:text-4xl">
            Meet the <span className="text-primary">team</span>
          </h2>
          <p className="mx-auto mt-4 mb-12 max-w-2xl text-center text-on-surface-variant">
            We split product, mobile, and web. Campus is the first home for Click because that is
            where a lot of people start over at the same time.
          </p>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {ABOUT_TEAM.map((member) => (
              <FcCard key={member.email} className="p-8 text-center">
                <div className="mx-auto mb-6 h-24 w-24 overflow-hidden rounded-full">
                  <CardVisualHero id={member.email} className="flex h-24 w-24 items-center justify-center">
                    <span className="text-4xl font-bold text-white">{member.initials}</span>
                  </CardVisualHero>
                </div>
                <h3 className="text-2xl font-bold">{member.name}</h3>
                <p className="mt-2 text-on-surface-variant">{member.subtitle}</p>
                <p className="mt-4 text-left text-sm leading-relaxed text-on-surface-variant">{member.text}</p>
                <a href={`mailto:${member.email}`} className="mt-4 inline-block text-sm text-primary hover:underline">
                  {member.email}
                </a>
              </FcCard>
            ))}
          </div>
        </section>
      </div>
    </FcPageShell>
  );
}
