"use client";

import Link from "next/link";
import { Avatar } from "@/components/ds/Avatar";
import { cardClassName } from "@/components/ds/Card";
import { PersonRow } from "@/components/ds/PersonRow";
import { useAuth } from "@/lib/AuthContext";
import { personHref } from "@/lib/shell/appNav";

function useHostHref(creatorId: string | null): string | undefined {
  const { user } = useAuth();
  if (!creatorId) return undefined;
  return user ? personHref(creatorId) : `/c/${creatorId}`;
}

/** "Hosted by" card (spec §7.6.2, desktop left column). */
export function EventHostCard({
  creatorId,
  name,
  avatarUrl,
  reportHref,
}: {
  creatorId: string | null;
  name: string | null;
  avatarUrl: string | null;
  reportHref: string;
}) {
  const { user } = useAuth();
  const href = useHostHref(creatorId);
  const label = name?.trim();
  const canContact = Boolean(user && creatorId && user.id !== creatorId);
  return (
    <>
      {label ? (
        <section className={cardClassName({ compact: true })} aria-label="Host">
          <p className="type-meta font-semibold text-fg-secondary">Hosted by</p>
          <PersonRow seed={creatorId ?? label} name={label} src={avatarUrl} href={href} className="min-h-14" />
        </section>
      ) : null}
      <p className="type-meta flex flex-wrap gap-x-4 gap-y-1 px-1 text-fg-tertiary">
        {canContact && href ? (
          <Link href={href} className="hover:text-fg-secondary hover:underline">
            Contact the host
          </Link>
        ) : null}
        <a href={reportHref} className="hover:text-fg-secondary hover:underline">
          Report event
        </a>
      </p>
    </>
  );
}

/** Mobile host line under the title (the desktop shows the card instead). */
export default function EventHostRow({
  creatorId,
  name,
  avatarUrl,
}: {
  creatorId: string | null;
  name: string | null;
  avatarUrl: string | null;
}) {
  const href = useHostHref(creatorId);
  const label = name?.trim();
  if (!label) return null;
  const inner = (
    <>
      <Avatar seed={creatorId ?? label} name={label} src={avatarUrl} size={24} />
      <span className="type-meta text-fg-secondary">
        Hosted by <span className="font-semibold text-fg">{label}</span>
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="inline-flex items-center gap-2 hover:underline">
      {inner}
    </Link>
  ) : (
    <div className="inline-flex items-center gap-2">{inner}</div>
  );
}
