import type { Metadata } from "next";
import Link from "next/link";
import { FcCard, FcPageShell } from "@/components/fc";
import { CardVisualHero } from "@/components/ui/CardVisualSurface";
import { ABOUT_TEAM } from "@/components/about/team";

export const metadata: Metadata = {
  title: "About Click",
  description:
    "We're University of Washington students building a way to keep the people standing in front of you — not another feed.",
};

export default function AboutPage() {
  return (
    <FcPageShell className="px-6 py-20 md:px-12">
      <div className="mx-auto max-w-5xl">
        <h1
          id="about-heading"
          data-testid="about-heading"
          className="text-center text-5xl font-bold md:text-6xl"
        >
          About <span className="text-primary">Click</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-relaxed text-on-surface-variant">
          We&apos;re five Computer Science students at the University of Washington. We got tired of
          collecting follows that never become people, so we&apos;re building a way to keep the ones
          standing in front of you.
        </p>
        <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-relaxed text-on-surface-variant">
          How Click works — and how to join the waitlist — is on the{" "}
          <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
            homepage
          </Link>
          .
        </p>

        <section className="mt-16">
          <h2 className="text-center text-3xl font-bold md:text-4xl">Why we started</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center leading-relaxed text-on-surface-variant">
            Orientation. Dawg Daze. A conversation that felt like it should continue. Then an Instagram
            follow, and nothing. We wanted a place for the people you actually met — the room, the night,
            the next time you&apos;re both free — without turning it into another scroll.
          </p>
        </section>

        <section className="mt-20">
          <h2 className="text-center text-3xl font-bold md:text-4xl">
            Meet the <span className="text-primary">team</span>
          </h2>
          <p className="mx-auto mt-4 mb-12 max-w-2xl text-center text-on-surface-variant">
            Five of us work on product, mobile, and web, with a focus on campus life and making big
            transitions — new school, new city, new semester — a little less lonely.
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
