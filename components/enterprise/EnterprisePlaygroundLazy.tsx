"use client";

import dynamic from "next/dynamic";

const EnterprisePlayground = dynamic(() => import("./EnterprisePlayground"), {
  ssr: false,
  loading: () => <div className="h-[clamp(600px,calc(100svh-120px),820px)] rounded-xl bg-fill-subtle" aria-hidden />,
});

export default function EnterprisePlaygroundLazy() {
  return <EnterprisePlayground />;
}
