"use client";

import dynamic from "next/dynamic";

const InsightsEventsClient = dynamic(() => import("./InsightsEventsClient"), { ssr: false });

export default function InsightsEventsPage() {
  return <InsightsEventsClient />;
}
