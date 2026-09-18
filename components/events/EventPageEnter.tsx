"use client";

import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

const revealEase = [0.16, 1, 0.3, 1] as const;

/**
 * Smooth handoff from the route skeleton into ready event content.
 * The animation starts immediately and only moves a few pixels so it feels
 * weighted without creating a second loading phase.
 */
export default function EventPageEnter({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      data-testid="event-page-enter"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.38, ease: revealEase }}
    >
      {children}
    </motion.div>
  );
}
