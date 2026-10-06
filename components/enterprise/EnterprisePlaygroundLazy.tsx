"use client";

import dynamic from "next/dynamic";

const EnterprisePlayground = dynamic(() => import("./EnterprisePlayground"), {
  ssr: false,
  loading: () => <div className="h-[640px] rounded-[16px] bg-surface-raised" aria-hidden />,
});

export default function EnterprisePlaygroundLazy() {
  return <EnterprisePlayground />;
}
