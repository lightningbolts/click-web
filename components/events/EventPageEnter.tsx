import { type ReactNode } from "react";

/**
 * Stable ready-state wrapper for event routes. Route-level loading skeletons
 * already cover data fetches, so the resolved event should not fade from
 * opacity 0 and create a visible blank/flicker frame.
 */
export default function EventPageEnter({ children }: { children: ReactNode }) {
  return <div data-testid="event-page-enter">{children}</div>;
}
