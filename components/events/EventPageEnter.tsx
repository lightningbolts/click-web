"use client";

import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { fadePresence, fadeTransition } from "@/lib/motion";

/** Fade the event column in once the route payload is ready. */
export default function EventPageEnter({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      data-testid="event-page-enter"
      {...(reduceMotion ? {} : fadePresence)}
      transition={fadeTransition(0.28)}
    >
      {children}
    </motion.div>
  );
}
