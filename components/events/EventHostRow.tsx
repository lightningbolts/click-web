"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ds/Avatar";
import { cardClassName } from "@/components/ds/Card";
import { PersonRow } from "@/components/ds/PersonRow";
import { useAuth } from "@/lib/AuthContext";
import { categoryLabel } from "@/lib/places/categories";
import type { PlaceRef } from "@/lib/server/places/placeRefs";
import { personHref } from "@/lib/shell/appNav";

type HostProps = {
  creatorId: string | null;
  name: string | null;
  avatarUrl: string | null;
  /** A listed Click Place hosting the event is the host (spec 06 §5): its photo, name and page. */
  place?: PlaceRef | null;
};

type Host = { seed: string; label: string; src: string | null; href: string | undefined; detail: string | null };

function useHost({ creatorId, name, avatarUrl, place }: HostProps): Host | null {
  const { user } = useAuth();
  if (place) {
    return { seed: place.id, label: place.name, src: place.photo_url, href: `/p/${place.slug}`, detail: place.city };
  }
  const label = name?.trim();
  if (!label) return null;
  const href = creatorId ? (user ? personHref(creatorId) : `/c/${creatorId}`) : undefined;
  return { seed: creatorId ?? label, label, src: avatarUrl, href, detail: null };
}

/** "Hosted by" card (spec §7.6.2, desktop left column). */
export function EventHostCard({ reportHref, ...props }: HostProps & { reportHref: string }) {
  const { user } = useAuth();
  const host = useHost(props);
  const { creatorId, place } = props;
  const contactHref = user && creatorId && user.id !== creatorId ? personHref(creatorId) : null;
  return (
    <>
      {host ? (
        <section className={cardClassName({ compact: true })} aria-label="Host">
          <p className="type-meta font-semibold text-fg-secondary">Hosted by</p>
          <PersonRow
            seed={host.seed}
            name={host.label}
            src={host.src}
            href={host.href}
            subtitle={place ? [categoryLabel(place.category), place.city].filter(Boolean).join(" · ") : undefined}
            className="min-h-14"
          />
        </section>
      ) : null}
      <p className="type-meta flex flex-wrap gap-x-4 gap-y-1 px-1 text-fg-tertiary">
        {contactHref ? (
          <Link href={contactHref} className="hover:text-fg-secondary hover:underline">
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
export default function EventHostRow(props: HostProps) {
  const host = useHost(props);
  if (!host) return null;
  const inner = (
    <>
      <Avatar seed={host.seed} name={host.label} src={host.src} size={24} />
      <span className="type-meta min-w-0 truncate text-fg-secondary">
        Hosted by <span className="font-semibold text-fg">{host.label}</span>
        {host.detail ? ` · ${host.detail}` : null}
      </span>
      {props.place ? <ChevronRight size={14} strokeWidth={2.25} aria-hidden className="shrink-0 text-fg-tertiary" /> : null}
    </>
  );
  return host.href ? (
    <Link href={host.href} className="inline-flex max-w-full items-center gap-2 hover:underline">
      {inner}
    </Link>
  ) : (
    <div className="inline-flex max-w-full items-center gap-2">{inner}</div>
  );
}
