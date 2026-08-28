"use client";

import { useState } from "react";
import Link from "next/link";
import { ConnectionPeerAvatar } from "@/components/dashboard/ConnectionPeerAvatar";
import UserProfileModal from "@/components/UserProfileModal";
import { useAuth } from "@/lib/AuthContext";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";

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
  const [open, setOpen] = useState(false);
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
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 text-left hover:underline"
        >
          {inner}
        </button>
        {open ? (
          <UserProfileModal
            userId={creatorId}
            getAuthHeaders={getFreshAuthHeaders}
            onClose={() => setOpen(false)}
            currentUserId={user.id}
          />
        ) : null}
      </>
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
