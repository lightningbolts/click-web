"use client";
import useSWR from "swr";
import type { ReactNode } from "react";
export default function TicketingGate({ children }: { children: ReactNode }) {
  const { data } = useSWR("/api/ticketing/capabilities", (url) => fetch(url).then((r) => r.json()));
  return data?.enabled ? children : null;
}
