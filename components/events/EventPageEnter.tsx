"use client";

import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

const revealEase = [0.16, 1, 0.3, 1] as const;

/**
 * Smooth handoff from the route skeleton into ready event content.
 * Opacity only and short: the skeleton already holds the layout, so moving the
 * content would read as a second loading phase.
 */
export default function EventPageEnter({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      data-testid="event-page-enter"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: revealEase }}
    >
      {children}
    </motion.div>
  );
}
