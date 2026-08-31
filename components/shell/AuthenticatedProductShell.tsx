"use client";

import { type ReactNode } from "react";

/**
 * Event routes share the global horizontal Navbar with marketing pages.
 * This layout wrapper stays so `/events` and `/e/*` keep a stable tree.
 */
export default function AuthenticatedProductShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
