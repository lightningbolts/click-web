'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

type TeamMember = {
  name: string;
  initials: string;
  subtitle: string;
  text?: string;
  email?: string;
  gradient: string;
};

const TEAM: TeamMember[] = [
  {
    name: 'Kairui Cheng',
    initials: 'K',
    subtitle: 'Paul Allen School of Computer Science, UW 2029',
    text: 'Frustrated by adding people on Instagram and never talking again, I led product development for both the Click mobile app and website. Kairui has experience in developing full stack applications, utilized by journalists, advocacy groups, and lawyers from across the nation.',
    email: 'kcheng29@uw.edu',
    gradient: 'from-[#8338EC] to-purple-600',
  },
  {
    name: 'Matthew Epshtein',
    initials: 'M',
    subtitle: 'Paul Allen School of Computer Science, UW 2029',
    text: 'I helped with product design and development, motivated by an experience at UW\'s orientation and Dawg Daze events which left me wanting more. Matthew has experience in mobile and server-side development, as well as in leadership, project management and technical writing.',
    email: 'mepsht@uw.edu',
    gradient: 'from-purple-600 to-pink-600',
  },
  {
    name: 'Rayan Rizwan',
    initials: 'R',
    subtitle: 'Paul Allen School of Computer Science, UW 2029',
    text: 'Click\'s idea resonates with me because I believe that it helps businesses connect with students, ensuring a symbiotic relationship. Rayan has experience with financial planning, managing small businesses, project management and research.',
    email: 'rayanr@uw.edu',
    gradient: 'from-pink-600 to-red-600',
  },
  {
    name: 'Andrew Lu',
    initials: 'A',
    subtitle: 'Paul Allen School of Computer Science, UW 2029',
    text: 'I heard the idea from Kairui and found it compelling. I\'ve always found that messaging with online strangers never sat right with me. Andrew has worked with teams on fine-tuning LLMs and has web development experience through previous projects.',
    email: 'luand29@uw.edu',
    gradient: 'from-emerald-600 to-teal-600',
  },
  {
    name: 'Jaret Zhang',
    initials: 'J',
    subtitle: 'Paul Allen School of Computer Science, UW 2029',
    text: 'The idea of Click resonated with me as I\'ve always struggled with maintaining relationships between recent acquaintances. Jaret has experience with full stack development as well as game design from previous projects.',
    email: 'jaretz@uw.edu',
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
                  {member.text && (
                    <p className="mt-4 text-left text-sm leading-relaxed text-zinc-500">{member.text}</p>
                  )}
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
