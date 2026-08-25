"use client";

import { motion, useReducedMotion } from "framer-motion";
import { EventListCard, type EventListItem } from "@/components/events/EventListCard";
import { fadePresence, fadeTransition } from "@/lib/motion";

export default function PublicEventList({ events }: { events: EventListItem[] }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <motion.div
          key={event.beacon_id}
          {...(reduceMotion ? {} : fadePresence)}
          transition={fadeTransition(0.18)}
        >
          <EventListCard event={event} />
        </motion.div>
      ))}
    </div>
  );
}
