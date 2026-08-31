"use client";

import AuthenticatedProductShell from "@/components/shell/AuthenticatedProductShell";

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedProductShell>{children}</AuthenticatedProductShell>;
}
