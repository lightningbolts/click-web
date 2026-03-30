'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

type TeamMember = {
  name: string;
  initials: string;
  subtitle: string;
  email?: string;
  gradient: string;
};

const TEAM: TeamMember[] = [
  {
    name: 'Kairui Cheng',
    initials: 'K',
    subtitle: 'Computer Science, UW',
    email: 'kcheng29@uw.edu',
    gradient: 'from-[#8338EC] to-purple-600',
  },
  {
    name: 'Matthew Epshtein',
    initials: 'M',
    subtitle: 'Computer Science, UW',
    email: 'mepsht@uw.edu',
    gradient: 'from-purple-600 to-pink-600',
  },
  {
    name: 'Rayan Rizwan',
    initials: 'R',
    subtitle: 'Computer Science, UW',
    email: 'rayanr@uw.edu',
    gradient: 'from-pink-600 to-red-600',
  },
  {
    name: 'Andrew Lu',
    initials: 'A',
    subtitle: 'Computer Science, UW',
    email: 'luand29@uw.edu',
    gradient: 'from-emerald-600 to-teal-600',
  },
  {
    name: 'Jaret Zhang',
    initials: 'J',
    subtitle: 'Computer Science, UW',
    gradient: 'from-sky-600 to-indigo-600',
  },
];

export default function About() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-0 h-96 w-96 rounded-full bg-[#8338EC] opacity-15 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-[#8338EC] opacity-15 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-20 md:px-12">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="mb-6 text-center text-5xl font-bold md:text-6xl">
            About <span className="text-[#8338EC]">Click</span>
          </h1>
          <p className="mx-auto mb-6 max-w-2xl text-center text-lg leading-relaxed text-zinc-400">
            We&apos;re a team of Computer Science students at the{' '}
            <span className="text-zinc-300">University of Washington</span> building tools for real-world connection, not
            another endless feed.
          </p>
          <p className="mx-auto mb-16 max-w-xl text-center text-sm leading-relaxed text-zinc-500">
            For what Click does, why it exists, and how to join the waitlist or create an account, see the{' '}
            <Link href="/" className="font-medium text-[#8338EC] underline-offset-4 hover:underline">
              homepage
            </Link>
            .
          </p>

          <section>
            <h2 className="mb-4 text-center text-3xl font-bold md:text-4xl">
              Meet the <span className="text-[#8338EC]">team</span>
            </h2>
            <p className="mx-auto mb-12 max-w-2xl text-center text-zinc-400">
              Five of us are working on product, mobile, and web, with a focus on campus life and making big transitions
              (new school, new city, new semester) a little less lonely.
            </p>

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {TEAM.map((member, i) => (
                <motion.div
                  key={member.name}
                  initial={{ y: 28, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.65, delay: i * 0.06 }}
                  viewport={{ once: true }}
                  className="glass rounded-3xl border border-zinc-800 p-8 text-center transition-colors hover:border-[#8338EC]/50"
                >
                  <div
                    className={`mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br text-4xl font-bold ${member.gradient}`}
                  >
                    {member.initials}
                  </div>
                  <h3 className="mb-2 text-2xl font-bold">{member.name}</h3>
                  <p className="text-zinc-400">{member.subtitle}</p>
                  {member.email && (
                    <a
                      href={`mailto:${member.email}`}
                      className="mt-4 inline-block text-sm text-[#8338EC] hover:underline"
                    >
                      {member.email}
                    </a>
                  )}
                </motion.div>
              ))}
            </div>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
