"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EventListCard, type EventListItem } from "@/components/events/EventListCard";
import { fadePresence, fadeTransition } from "@/lib/motion";
import { FcInput } from "@/components/fc";
import { cn } from "@/lib/cn";

type GroupKey = "today" | "week" | "upcoming";

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function groupFor(iso: string | null, now: Date): GroupKey {
  if (!iso) return "upcoming";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "upcoming";
  const today = startOfDay(now);
  const eventDay = startOfDay(new Date(ms));
  if (eventDay === today) return "today";
  const weekEnd = today + 7 * 24 * 60 * 60 * 1000;
  if (eventDay < weekEnd) return "week";
  return "upcoming";
}

const GROUP_LABEL: Record<GroupKey, string> = {
  today: "Today",
  week: "This week",
  upcoming: "Upcoming",
};

export default function PublicEventList({ events }: { events: EventListItem[] }) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"date" | "going" | "host">("date");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const next = events.filter((event) => {
      if (!q) return true;
      return [event.title, event.description, event.location_name, event.host_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
    next.sort((a, b) => {
      if (sort === "going") return (b.rsvp_count ?? 0) - (a.rsvp_count ?? 0);
      if (sort === "host") {
        return (a.host_name || "").localeCompare(b.host_name || "");
      }
      const aMs = a.event_start_at ? Date.parse(a.event_start_at) : Number.POSITIVE_INFINITY;
      const bMs = b.event_start_at ? Date.parse(b.event_start_at) : Number.POSITIVE_INFINITY;
      return aMs - bMs;
    });
    return next;
  }, [events, query, sort]);

  const featured = filtered[0] ?? null;
  const rest = featured ? filtered.slice(1) : [];
  const now = new Date();
  const groups: Record<GroupKey, EventListItem[]> = { today: [], week: [], upcoming: [] };
  for (const event of rest) {
    groups[groupFor(event.event_start_at, now)].push(event);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <FcInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events"
          aria-label="Search events"
          className="flex-1"
        />
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["date", "Date"],
              ["going", "Going"],
              ["host", "Host"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSort(id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-semibold",
                sort === id
                  ? "border-primary bg-primary text-on-primary"
                  : "border-border-hard bg-surface text-on-surface",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {featured ? (
        <motion.div {...(reduceMotion ? {} : fadePresence)} transition={fadeTransition(0.18)}>
          <EventListCard event={featured} featured />
        </motion.div>
      ) : (
        <p className="text-sm text-on-surface-variant">No events match that search.</p>
      )}

      {(["today", "week", "upcoming"] as const).map((key) =>
        groups[key].length === 0 ? null : (
          <section key={key} className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-on-surface-variant">
              {GROUP_LABEL[key]}
            </h2>
            {groups[key].map((event) => (
              <motion.div
                key={event.beacon_id}
                {...(reduceMotion ? {} : fadePresence)}
                transition={fadeTransition(0.18)}
              >
                <EventListCard event={event} />
              </motion.div>
            ))}
          </section>
        ),
      )}
    </div>
  );
}
