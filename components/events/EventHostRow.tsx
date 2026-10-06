"use client";

import Link from "next/link";
import { ConnectionPeerAvatar } from "@/components/dashboard/ConnectionPeerAvatar";
import { useAuth } from "@/lib/AuthContext";
import { personHref } from "@/lib/shell/appNav";

export default function EventHostRow({
  creatorId,
  name,
  avatarUrl,
}: {
  creatorId: string | null;
  name: string | null;
  avatarUrl: string | null;
}) {
  const { user } = useAuth();
  const label = name?.trim() || "Host";
  if (!name?.trim() && !creatorId) return null;

  const inner = (
    <>
      <ConnectionPeerAvatar label={label} imageUrl={avatarUrl} size="sm" />
      <span className="text-sm font-medium text-on-surface">Hosted by {label}</span>
    </>
  );

  if (user && creatorId) {
    return (
      <Link href={personHref(creatorId)} className="inline-flex items-center gap-2 hover:underline">
        {inner}
      </Link>
    );
  }

  if (creatorId) {
    return (
      <Link href={`/c/${creatorId}`} className="inline-flex items-center gap-2 hover:underline">
        {inner}
      </Link>
    );
  }

  return <div className="inline-flex items-center gap-2">{inner}</div>;
}
