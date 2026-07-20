'use client';

import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle,
  GraduationCap,
  MapPin,
  MessageSquare,
  Mic2,
  Mountain,
  Radio,
  Shield,
  Store,
  Users,
  Users2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import EnterpriseProductShot, { ENTERPRISE_SCREENSHOTS } from '@/components/enterprise/EnterpriseProductShot';

const AUDIENCES = [
  {
    title: 'Small & growing businesses',
    icon: Store,
    body: 'Pop-ups, studios, local brands, and regional teams use Click when handshakes matter more than impressions. Turn real-world moments into contacts your staff can follow up on, without dictating handles across the counter.',
    bullets: [
      'Proximity Tap keeps lines moving without username archaeology',
      'Event engagement shows what drove RSVPs and check-ins',
      'No feed, no algorithm between you and the customer',
    ],
  },
  {
    title: 'Large organizations & venues',
    icon: Building2,
    body: 'Conferences, stadiums, hospitality groups, and multi-site operators need one consistent way to exchange identity on the floor. Click keeps same-room verification fast for guests while giving you aggregate insight into pairs, pulses, and verified micro-communities.',
    bullets: [
      'High-throughput Proximity Tap and Multi-Tap group flows',
      'Event- and location-aware context',
      'Directional analytics for programming and sponsorship decisions',
    ],
  },
  {
    title: 'Institutions & education',
    icon: GraduationCap,
    body: 'Universities, research labs, alumni networks, and training programs are full of one-off introductions that deserve to stick. Click fits orientation, mixers, labs, and field programs where students and staff meet peers they may not see again until finals or graduation.',
    bullets: ['Orientation and cohort onboarding', 'Research symposia and poster sessions', 'Alumni weekends without the business-card pile'],
  },
] as const;

const USE_CASES = [
  { title: 'Conferences & trade shows', desc: 'Booth staff and attendees connect in seconds with Proximity Tap; organizers see which touchpoints drove real exchanges and which friend clusters stuck together.' },
  { title: 'Campus life & student affairs', desc: 'Clubs, housing, and career fairs where context (event, place, time) prevents the “who was that?” problem later, plus Multi-Tap for verified study groups and cohort intros.' },
  { title: 'Customer experience & retail', desc: 'High-touch retail, showrooms, and demos: swap contact without breaking the conversation.' },
  { title: 'Membership & alumni', desc: 'Associations, foundations, and advancement teams strengthen ties when every handshake is captured with consent.' },
  { title: 'Public & civic programs', desc: 'Workshops, town halls, and community programs where participants opt in to stay connected beyond a single evening.' },
] as const;

const OUTCOME_VERTICALS = [
  {
    title: 'Universities',
    icon: GraduationCap,
    outcome:
      'Know which dorms are socially isolated before the first midterm, not after the dropout.',
    metric: 'Connection Velocity (freshman class, first 6 weeks)',
  },
  {
    title: 'Events & venues',
    icon: Mic2,
    outcome: 'Find out which artists actually build a fanbase vs. just sell tickets.',
    metric:
      'Social Sticky Score (connections per 100 attendees, post-event re-engagement rate)',
  },
  {
    title: 'Climbing gyms & third places',
    icon: Mountain,
    outcome: 'Turn regulars who recognize each other into regulars who actually know each other.',
    metric: 'Return Connection Rate (pairs who met at your venue and came back)',
  },
] as const;

const CAPABILITIES = [
  {
    title: 'Proximity Tap at crowd speed',
    icon: Users,
    text: 'Tri-Factor Handshake flows are built for lines, lobbies, and loud rooms: Bluetooth plus inaudible audio prove co-presence before profiles move. Optional QR remains where you need a visual fallback, without making hardware the hero.',
  },
  {
    title: 'Context that survives the week',
    icon: CalendarDays,
    text: 'Optional memory capsules tie a connection to place, time, and encounter type so teams and individuals remember how they met.',
  },
  {
    title: 'Business Insights workspace',
    icon: BarChart3,
    text: 'Verified businesses open a full analytics area on the web: social patterns, Event engagement funnels, micro-community graphs, maps, live pulse, and modules tuned for operators (where enabled). The Business Insights section on this page goes deeper.',
  },
  {
    title: 'Privacy-forward by design',
    icon: Shield,
    text: 'Exchange is explicit and user-controlled. We design for clear consent, minimal friction, and sensible defaults for personal data.',
  },
] as const;

const INSIGHTS_PILLARS = [
  {
    title: 'Social patterns, not just headcount',
    icon: Activity,
    lead:
      'Go beyond RSVPs and door counts. Business Insights surfaces how in-person connection actually behaves: bursts of activity, where people tend to meet, how pairs repeat, and when mathematically verified friend groups arrive together so you can price sponsorships on real micro-communities.',
    bullets: [
      { icon: CalendarDays, text: 'Event engagement: impression → RSVP → check-in funnel for venue-linked events.' },
      { icon: Activity, text: 'Social Activity: trends and pulses of connection over time.' },
      { icon: MapPin, text: 'Heatmap: spatial clustering so you see which zones drive real exchanges.' },
      { icon: Users2, text: 'Micro-Community and Tribe views: overlapping circles, verified Multi-Tap cliques, repeat overlap.' },
      { icon: MessageSquare, text: 'Vibe Stream: encounter-flavored context where users opt in (tone and themes, not DMs).' },
    ],
  },
  {
    title: 'Employees and reps on the same product',
    icon: Users,
    lead:
      'Floor staff, student ambassadors, booth teams, and member services use the same Proximity Tap and Multi-Tap flows as guests. Adoption becomes measurable: you can see which teams and touchpoints turn into real connections instead of passive handoffs.',
    bullets: [
      { icon: Users2, text: 'Align incentives: reward teams that create memorable exchanges, not just scans.' },
      { icon: BarChart3, text: 'Compare segments (shift, location, role) when your contract includes breakdowns.' },
      { icon: Shield, text: 'Designed for operational insight with consent and policy guardrails in mind.' },
    ],
  },
  {
    title: 'Live metrics for the room',
    icon: Radio,
    lead:
      'For venues and timed programs, Live Metrics adds a real-time layer: how full the moment feels, how momentum shifts through the day, and how that lines up with hourly patterns you already track.',
    bullets: [
      { icon: Radio, text: 'Live Metrics: occupancy-style signals and crowd trend readouts (where enabled).' },
      { icon: BarChart3, text: 'Pair with charts and peaks to adjust staffing, programming, and floor layout.' },
    ],
  },
] as const;

const FAQ = [
  {
    q: 'Is Click only for students or campuses?',
    a: 'No. Click started with real-world connection on campus, but the same friction (lost context after a quick hello) shows up at work, conferences, and customer-facing events. Enterprise and institution programs are a core part of how we think about scale.',
  },
  {
    q: 'How do we pilot with a single team or department?',
    a: 'Most partners begin with one flagship event or cohort: orientation, a conference track, or a flagship store weekend. We help you define success metrics (connections, follow-up, repeat attendance) before expanding.',
  },
  {
    q: 'What about FERPA, COPPA, or internal compliance?',
    a: 'Requirements vary by jurisdiction and contract. Share your policies early. We align data flows, retention, and age gating with your legal and IT stakeholders. We do not replace your counsel; we work with them.',
  },
  {
    q: 'What appears in Business Insights?',
    a: 'Verified business accounts use the Insights area on the web, with views such as Overview, Event engagement (impression → RSVP → check-in), Social Activity, Heatmap, Tribe and micro-community analysis, Vibe Stream, and Live Metrics. What you see depends on your configuration, data volume, and privacy choices. It is designed for aggregate and operational insight, not for surveilling individuals without consent.',
  },
  {
    q: 'Can we integrate with our CRM or event stack?',
    a: 'Roadmap-dependent. Tell us which systems matter (ticketing, CRM, LMS, identity). We prioritize integrations that reduce duplicate entry and respect user consent.',
  },
  {
    q: 'Do you offer custom branding or dedicated deployments?',
    a: 'For qualified enterprise and institution engagements we discuss branded experiences, training, and rollout support. Reach out with scope and timeline.',
  },
] as const;

export default function EnterprisePage() {
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submitWaitlist = async () => {
    if (!email.includes('@')) {
      setStatus('error');
      setMessage('Enter a valid email address.');
      return;
    }
    setStatus('loading');
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'enterprise_landing' }),
      });
      const data = await response.json();
      if (data.success) {
        setStatus('success');
        setMessage(data.message || "You're on the list! We'll be in touch.");
        return;
      }
      setStatus('error');
      setMessage(data.error || 'Something went wrong.');
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <div className="relative z-10">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 md:px-12 md:pb-24 md:pt-16">
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.75 }}
            className="text-center"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-hard bg-surface-container/60 px-4 py-2 text-sm text-on-surface-variant">
              <GraduationCap className="h-4 w-4 text-primary" />
              <span>Higher ed &amp; Student Affairs</span>
            </div>
            <h1 className="mb-6 max-w-5xl mx-auto text-3xl font-bold tracking-tight text-balance sm:text-4xl md:text-5xl lg:text-6xl">
              <span className="text-on-surface">
                A university can&apos;t measure student loneliness from their contact lists. They can from ours.
              </span>
            </h1>
            <p className="mx-auto mb-10 max-w-3xl text-lg leading-relaxed text-on-surface-variant md:text-xl">
              Click gives Student Affairs offices a real-time connection velocity dashboard: the leading indicator for freshman
              retention that no other platform produces.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <motion.a
                href="mailto:mepsht@uw.edu?subject=Click%20Enterprise%20%2F%20Institution%20inquiry"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-primary px-8 py-4 text-base font-bold text-on-primary  transition-colors hover:brightness-90 sm:w-auto"
              >
                Talk to us
                <ArrowRight className="h-4 w-4" />
              </motion.a>
              <motion.button
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setShowWaitlist(true);
                  setStatus('idle');
                  setMessage('');
                }}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-border-hard bg-surface-container/50 px-8 py-4 text-base font-semibold text-on-surface transition-colors hover:border-primary/50 sm:w-auto"
              >
                Join the waitlist
              </motion.button>
            </div>
            <p className="mt-6 text-center text-sm text-outline">
              New to the product?{' '}
              <Link href="/" className="text-primary underline-offset-4 hover:underline">
                See the consumer story
              </Link>{' '}
              or{' '}
              <Link href="/about" className="text-primary underline-offset-4 hover:underline">
                meet the team
              </Link>
              .
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.65, delay: 0.15 }}
            className="mx-auto mt-4 grid max-w-6xl gap-6 md:grid-cols-3"
          >
            {OUTCOME_VERTICALS.map((v) => (
              <article
                key={v.title}
                className="fc-card flex flex-col rounded-[16px] border border-border-hard bg-surface-container/30 p-6 text-left transition-colors hover:border-primary/35"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
                  <v.icon className="h-6 w-6 text-primary" />
                </div>
                <h2 className="mb-3 text-lg font-bold text-on-surface">{v.title}</h2>
                <p className="mb-4 flex-1 text-sm leading-relaxed text-on-surface-variant">{v.outcome}</p>
                <p className="border-t border-border-hard/80 pt-4 text-xs font-medium uppercase tracking-wide text-primary">
                  Metric highlighted
                </p>
                <p className="mt-1 text-sm leading-snug text-on-surface-variant">{v.metric}</p>
              </article>
            ))}
          </motion.div>

          <div className="mx-auto mt-10 max-w-6xl md:mt-12">
            <EnterpriseProductShot
              id="enterprise-shot-insights-overview"
              src={ENTERPRISE_SCREENSHOTS.overview}
              alt="Click Insights — Overview dashboard with Social Sticky Score, connection density, and live occupancy"
              caption="Click Insights (web) — Overview: social ROI-style KPIs alongside live room signals when enabled."
            />
          </div>

          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mx-auto mt-12 max-w-3xl rounded-2xl border border-primary/25 bg-gradient-to-br from-on-primary-container via-surface to-surface px-6 py-8 text-center md:px-10"
          >
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">University ROI snapshot</p>
            <p className="mt-4 text-base leading-relaxed text-on-surface md:text-lg">
              If Click is deployed at a university of 30,000 students and improves freshman retention by 1%: 300 students retained
              × ~$30,000 avg tuition = <span className="font-semibold text-on-surface">$9,000,000</span> in tuition revenue preserved.
              One pilot. One semester.
            </p>
          </motion.div>

          <div className="mx-auto mt-10 max-w-6xl md:mt-12">
            <EnterpriseProductShot
              id="enterprise-shot-environment-flow"
              src={ENTERPRISE_SCREENSHOTS.environment}
              alt="Click Insights — Environment and flow: acoustic conversion, cross-pollination, weather resilience, and social flow"
              caption="Environment & flow — acoustics, peaks, cross-pollination, and GCR-style mix in one workspace."
            />
          </div>
        </section>

        {/* Audiences */}
        <section className="border-t border-zinc-900 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-6 md:px-12">
            <motion.div
              initial={{ y: 28, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.7 }}
              viewport={{ once: true }}
              className="mb-12 text-center md:mb-16"
            >
              <h2 className="mb-4 text-3xl font-bold md:text-4xl lg:text-5xl">
                Who <span className="text-primary">it&apos;s for</span>
              </h2>
              <p className="mx-auto max-w-2xl text-on-surface-variant">
                One product surface, three common scales: from a single location to a distributed institution.
              </p>
            </motion.div>
            <div className="grid gap-8 lg:grid-cols-3">
              {AUDIENCES.map((block, i) => (
                <motion.article
                  key={block.title}
                  initial={{ y: 28, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.65, delay: i * 0.08 }}
                  viewport={{ once: true }}
                  className="fc-card flex flex-col rounded-[16px] border border-border-hard p-8 transition-colors hover:border-primary/40"
                >
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
                    <block.icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold md:text-2xl">{block.title}</h3>
                  <p className="mb-6 flex-1 text-sm leading-relaxed text-on-surface-variant md:text-base">{block.body}</p>
                  <ul className="space-y-2 border-t border-border-hard/80 pt-6 text-sm text-on-surface-variant">
                    {block.bullets.map((b) => (
                      <li key={b} className="flex gap-2">
                        <span className="mt-0.5 shrink-0 text-primary">✓</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="border-t border-zinc-900 bg-background/80 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-6 md:px-12">
            <motion.div
              initial={{ y: 28, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.7 }}
              viewport={{ once: true }}
              className="mb-12 md:mb-16"
            >
              <h2 className="mb-4 text-center text-3xl font-bold md:text-4xl lg:text-5xl">
                Programs we <span className="text-primary">hear about</span> first
              </h2>
              <p className="mx-auto max-w-2xl text-center text-on-surface-variant">
                Examples of where Proximity Tap, Multi-Tap groups, and contextual memory matter most. Your rollout may combine several of these.
              </p>
            </motion.div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {USE_CASES.map((u, i) => (
                <motion.div
                  key={u.title}
                  initial={{ y: 22, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.55, delay: (i % 3) * 0.05 }}
                  viewport={{ once: true }}
                  className="rounded-2xl border border-border-hard bg-surface-container/40 p-6 transition-colors hover:border-border-hard"
                >
                  <h3 className="mb-2 text-lg font-semibold text-on-surface">{u.title}</h3>
                  <p className="text-sm leading-relaxed text-on-surface-variant">{u.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <div className="border-t border-zinc-900 bg-background/50 py-10 md:py-14">
          <div className="mx-auto max-w-6xl px-6 md:px-12">
            <EnterpriseProductShot
              id="enterprise-shot-heatmap-tribes"
              src={ENTERPRISE_SCREENSHOTS.heatmapGrid}
              alt="Click Insights — Spatial heatmap, tribe analysis, social activity trends, and vibe stream"
              caption="Heatmap, tribes, activity, and stream — see where connection clusters and how it moves over time."
            />
          </div>
        </div>

        {/* <div className="border-t border-zinc-900/80 bg-background/30 py-10 md:py-12">
          <div className="mx-auto max-w-6xl px-6 md:px-12">
            <EnterpriseProductShot
              id="enterprise-shot-insights-map-view"
              src={ENTERPRISE_SCREENSHOTS.mapView}
              alt="Click Map — dark map with clusters, layer toggles for network, soundtracks, beacons, and hazards"
              caption="Click Map — layer-ready map context for where connections and pins show up (demo)."
            />
          </div>
        </div> */}

        {/* Business Insights */}
        <section className="border-t border-zinc-900 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-6 md:px-12">
            <motion.div
              initial={{ y: 28, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.7 }}
              viewport={{ once: true }}
              className="mb-12 text-center md:mb-14"
            >
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                <BarChart3 className="h-4 w-4" />
                Business Insights
              </div>
              <h2 className="mb-4 text-3xl font-bold md:text-4xl lg:text-5xl">
                Analytics for <span className="text-primary">events</span> and social patterns
              </h2>
              <p className="mx-auto max-w-2xl text-on-surface-variant md:text-lg">
                Verified businesses get a web workspace to watch how connection shows up in the wild: event funnels,
                where exchanges cluster, how activity moves through time, and how staff and ambassadors who use Click
                compare across shifts or sites.
              </p>
            </motion.div>

            <div className="grid gap-8 lg:grid-cols-3">
              {INSIGHTS_PILLARS.map((pillar, i) => (
                <motion.article
                  key={pillar.title}
                  initial={{ y: 26, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.65, delay: i * 0.07 }}
                  viewport={{ once: true }}
                  className="fc-card flex flex-col rounded-[16px] border border-border-hard p-8 transition-colors hover:border-primary/35"
                >
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
                    <pillar.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold leading-snug">{pillar.title}</h3>
                  <p className="mb-6 text-sm leading-relaxed text-on-surface-variant md:text-base">{pillar.lead}</p>
                  <ul className="mt-auto space-y-3 border-t border-border-hard/80 pt-6">
                    {pillar.bullets.map((b) => (
                      <li key={b.text} className="flex gap-3 text-sm text-on-surface-variant">
                        <b.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/80" />
                        <span>{b.text}</span>
                      </li>
                    ))}
                  </ul>
                </motion.article>
              ))}
            </div>

            <div className="mt-10 md:mt-12">
              <EnterpriseProductShot
                id="enterprise-shot-event-engagement"
                src={ENTERPRISE_SCREENSHOTS.eventEngagement}
                alt="Click Insights — Event engagement funnel: impressions, bookmarks, shares, RSVPs, and check-ins"
                caption="Event engagement — impression → bookmark → share → RSVP → check-in for venue-linked events."
              />
            </div>

            <motion.div
              initial={{ y: 24, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.65 }}
              viewport={{ once: true }}
              className="mt-12 grid gap-8 lg:grid-cols-2"
            >
              <article className="fc-card flex flex-col rounded-[16px] border border-border-hard p-8 transition-colors hover:border-primary/35">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
                  <CalendarDays className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-3 text-xl font-bold leading-snug">Event engagement analytics</h3>
                <p className="mb-6 text-sm leading-relaxed text-on-surface-variant md:text-base">
                  Track the full funnel for venue-linked events: who saw it, who bookmarked or shared, who RSVPed, and
                  who actually checked in. Arrival timing and check-in reject reasons help you tighten ops for the next
                  night—not just celebrate door count.
                </p>
                <ul className="mt-auto space-y-2 border-t border-border-hard/80 pt-6 text-sm text-on-surface-variant">
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-primary">✓</span>
                    <span>Interest, share, and RSVP conversion rates in one view</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-primary">✓</span>
                    <span>RSVP → check-in with dwell percentiles and reject reasons</span>
                  </li>
                </ul>
              </article>
              <article className="fc-card flex flex-col rounded-[16px] border border-border-hard p-8 transition-colors hover:border-primary/35">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
                  <Users2 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-3 text-xl font-bold leading-snug">Micro-Community Analytics</h3>
                <p className="mb-6 text-sm leading-relaxed text-on-surface-variant md:text-base">
                  Go beyond basic foot traffic. Click mathematically verifies when groups of friends arrive together, not only
                  isolated visits. See whether your venue behaves like a passive pass-through or a sticky hub for micro-communities,
                  then package sponsorships that align with real social graphs instead of anonymous impressions.
                </p>
                <ul className="mt-auto space-y-2 border-t border-border-hard/80 pt-6 text-sm text-on-surface-variant">
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-primary">✓</span>
                    <span>Group-level arrival signals where Multi-Tap and graph checks succeed</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-primary">✓</span>
                    <span>Compare repeat micro-communities against one-off walkthrough traffic</span>
                  </li>
                </ul>
              </article>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
            >
              <Link
                href="/insights"
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-semibold text-on-primary transition-colors hover:brightness-90"
              >
                Open Business Insights
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="max-w-md text-center text-sm text-on-surface-variant sm:text-left">
                Sign in with a verified business account to explore Overview, Event engagement, Social Activity, Heatmap,
                Tribe views, Vibe Stream, and Live Metrics.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="border-t border-zinc-900 bg-background/80 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-6 md:px-12">
            <motion.div
              initial={{ y: 28, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.7 }}
              viewport={{ once: true }}
              className="mb-12 text-center md:mb-16"
            >
              <h2 className="mb-4 text-3xl font-bold md:text-4xl lg:text-5xl">
                What <span className="text-primary">you get</span>
              </h2>
              <p className="mx-auto max-w-2xl text-on-surface-variant">
                Capabilities map to how teams actually operate on the ground, not only as a checklist on a slide deck.
              </p>
            </motion.div>
            <div className="grid gap-8 md:grid-cols-2">
              {CAPABILITIES.map((c, i) => (
                <motion.div
                  key={c.title}
                  initial={{ y: 24, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.6, delay: i * 0.06 }}
                  viewport={{ once: true }}
                  className="fc-card flex gap-5 rounded-[16px] border border-border-hard p-8"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                    <c.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="mb-2 text-xl font-bold">{c.title}</h3>
                    <p className="text-sm leading-relaxed text-on-surface-variant md:text-base">{c.text}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Rollout */}
        <section className="border-t border-zinc-900 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-6 md:px-12">
            <motion.div
              initial={{ y: 28, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.7 }}
              viewport={{ once: true }}
              className="mx-auto max-w-3xl text-center"
            >
              <h2 className="mb-4 text-3xl font-bold md:text-4xl">
                Rollout, <span className="text-primary">without the big-bang risk</span>
              </h2>
              <p className="mb-10 text-on-surface-variant">
                We recommend a phased path: align on privacy and success metrics, run a contained pilot with one audience or
                venue, then iterate on messaging and staff training before wider launch.
              </p>
            </motion.div>
            <ol className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
              {[
                { step: '1', title: 'Discovery', desc: 'Scope, stakeholders, and compliance checkpoints.' },
                { step: '2', title: 'Pilot', desc: 'Single event, cohort, or location with clear KPIs.' },
                { step: '3', title: 'Scale', desc: 'Playbooks, training, and optional integrations.' },
              ].map((item, i) => (
                <motion.li
                  key={item.step}
                  initial={{ y: 20, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.55, delay: i * 0.1 }}
                  viewport={{ once: true }}
                  className="fc-card relative rounded-2xl border border-border-hard p-6 text-center"
                >
                  <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary">
                    {item.step}
                  </span>
                  <h3 className="mb-2 font-bold text-on-surface">{item.title}</h3>
                  <p className="text-sm text-on-surface-variant">{item.desc}</p>
                </motion.li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-zinc-900 py-16 md:py-24">
          <div className="mx-auto max-w-3xl px-6 md:px-12">
            <motion.h2
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              className="mb-10 text-center text-3xl font-bold md:text-4xl"
            >
              Questions <span className="text-primary">we expect</span>
            </motion.h2>
            <div className="space-y-4">
              {FAQ.map((item, i) => (
                <motion.div
                  key={item.q}
                  initial={{ y: 16, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  viewport={{ once: true }}
                >
                  <details className="group fc-card rounded-2xl border border-border-hard px-5 py-4 open:border-primary/30">
                    <summary className="cursor-pointer list-none font-semibold text-on-surface [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center justify-between gap-3">
                        {item.q}
                        <span className="text-on-surface-variant transition group-open:rotate-45">+</span>
                      </span>
                    </summary>
                    <p className="mt-3 border-t border-border-hard/80 pt-3 text-sm leading-relaxed text-on-surface-variant">{item.a}</p>
                  </details>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-zinc-900 pb-24 pt-16 md:pb-32">
          <div className="mx-auto max-w-4xl px-6 text-center md:px-12">
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              className="fc-card rounded-[16px] border border-primary/25 bg-gradient-to-b from-primary/10 to-transparent px-8 py-12 md:px-12"
            >
              <h2 className="mb-4 text-2xl font-bold md:text-3xl">Bring Click to your organization</h2>
              <p className="mx-auto mb-8 max-w-xl text-on-surface-variant">
                Tell us about your audience, timeline, and any compliance constraints. We&apos;ll follow up with next steps.
              </p>
              <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <a
                  href="mailto:mepsht@uw.edu?subject=Click%20Enterprise%20%2F%20Institution%20inquiry"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-4 font-semibold text-on-primary transition-colors hover:brightness-90"
                >
                  Email the team
                  <ArrowRight className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setShowWaitlist(true);
                    setStatus('idle');
                    setMessage('');
                  }}
                  className="rounded-2xl border border-zinc-600 px-8 py-4 font-semibold text-on-surface transition-colors hover:border-primary/50"
                >
                  Join the waitlist
                </button>
              </div>
            </motion.div>
          </div>
        </section>
      </div>

      {showWaitlist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-md rounded-[16px] border border-border-hard bg-background/95 p-6"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-on-surface">Enterprise waitlist</h2>
                <p className="mt-2 text-sm text-on-surface-variant">
                  We&apos;ll note your interest for org-wide pilots and institution programs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWaitlist(false)}
                className="rounded-full border border-border-hard p-2 text-on-surface-variant transition hover:border-border-hard hover:text-on-surface"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {status === 'success' ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
                <CheckCircle className="mx-auto mb-3 h-10 w-10 text-emerald-700 dark:text-emerald-300" />
                <p className="font-medium text-emerald-700 dark:text-emerald-300">You&apos;re on the list.</p>
                <p className="mt-2 text-sm text-on-surface-variant">{message}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === 'error') {
                      setStatus('idle');
                      setMessage('');
                    }
                  }}
                  placeholder="you@organization.edu"
                  className="w-full rounded-2xl border border-border-hard bg-surface-container px-4 py-3 text-on-surface outline-none transition focus:border-primary"
                />
                {status === 'error' && <p className="text-sm text-red-700 dark:text-red-400">{message}</p>}
                <button
                  type="button"
                  onClick={submitWaitlist}
                  disabled={status === 'loading'}
                  className="w-full rounded-2xl bg-primary px-4 py-3 font-semibold text-on-primary transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'loading' ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
