"use client";

import AuthenticatedProductShell from "@/components/shell/AuthenticatedProductShell";

export default function EventShareLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedProductShell>{children}</AuthenticatedProductShell>;
}
