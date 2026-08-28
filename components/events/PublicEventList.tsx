"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EventListCard, type EventListItem } from "@/components/events/EventListCard";
import { fadePresence, fadeTransition } from "@/lib/motion";
import { FcInput } from "@/components/fc";
import { Pill } from "@/components/ui/Pill";

type GroupKey = "today" | "week" | "upcoming";
type TemporalTab = "upcoming" | "past";

const DAY_MS = 24 * 60 * 60 * 1000;

function calendarDayOrdinal(ms: number, timeZone?: string | null): number {
  const format = (zone?: string) => {
    const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory", {
      ...(zone ? { timeZone: zone } : {}),
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(new Date(ms));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    return Date.UTC(value("year"), value("month") - 1, value("day")) / DAY_MS;
  };
  try {
    return format(timeZone?.trim() || undefined);
  } catch {
    return format();
  }
}

export function groupFor(iso: string | null, timeZone: string | null | undefined, now: Date): GroupKey {
  if (!iso) return "upcoming";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "upcoming";
  const dayDifference =
    calendarDayOrdinal(ms, timeZone) - calendarDayOrdinal(now.getTime(), timeZone);
  if (dayDifference === 0) return "today";
  if (dayDifference > 0 && dayDifference < 7) return "week";
  return "upcoming";
}

const GROUP_LABEL: Record<GroupKey, string> = {
  today: "Today",
  week: "This week",
  upcoming: "Upcoming",
};

export default function PublicEventList({
  upcomingEvents,
  pastEvents = [],
}: {
  upcomingEvents: EventListItem[];
  pastEvents?: EventListItem[];
}) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"date" | "going" | "host">("date");
  const [temporal, setTemporal] = useState<TemporalTab>("upcoming");

  const sourceEvents = temporal === "upcoming" ? upcomingEvents : pastEvents;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const next = sourceEvents.filter((event) => {
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
      const sortKey = (item: EventListItem) => {
        const end = item.event_end_at ? Date.parse(item.event_end_at) : NaN;
        if (Number.isFinite(end)) return end;
        const start = item.event_start_at ? Date.parse(item.event_start_at) : NaN;
        return Number.isFinite(start) ? start : 0;
      };
      const aMs = sortKey(a);
      const bMs = sortKey(b);
      return temporal === "past" ? bMs - aMs : aMs - bMs;
    });
    return next;
  }, [sourceEvents, query, sort, temporal]);

  const featured = temporal === "upcoming" ? (filtered[0] ?? null) : null;
  const rest = featured ? filtered.slice(1) : filtered;
  const now = new Date();
  const groups: Record<GroupKey, EventListItem[]> = { today: [], week: [], upcoming: [] };
  if (temporal === "upcoming") {
    for (const event of rest) {
      groups[groupFor(event.event_start_at, event.timezone, now)].push(event);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3">
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Event timeframe"
        >
          {(
            [
              ["upcoming", "Upcoming"],
              ["past", "Past events"],
            ] as const
          ).map(([id, label]) => (
            <Pill
              key={id}
              role="tab"
              aria-selected={temporal === id}
              selected={temporal === id}
              onClick={() => setTemporal(id)}
            >
              {label}
            </Pill>
          ))}
        </div>
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
                ["going", temporal === "past" ? "Went" : "Going"],
                ["host", "Host"],
              ] as const
            ).map(([id, label]) => (
              <Pill
                key={id}
                selected={sort === id}
                onClick={() => setSort(id)}
              >
                {label}
              </Pill>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          {temporal === "past" ? "No past events match that search." : "No events match that search."}
        </p>
      ) : null}

      {featured ? (
        <motion.div {...(reduceMotion ? {} : fadePresence)} transition={fadeTransition(0.18)}>
          <EventListCard event={featured} featured />
        </motion.div>
      ) : null}

      {temporal === "past" ? (
        <section className="space-y-3">
          {rest.map((event) => (
            <motion.div
              key={event.beacon_id}
              {...(reduceMotion ? {} : fadePresence)}
              transition={fadeTransition(0.18)}
            >
              <EventListCard event={event} past />
            </motion.div>
          ))}
        </section>
      ) : (
        (["today", "week", "upcoming"] as const).map((key) =>
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
        )
      )}
    </div>
  );
}
