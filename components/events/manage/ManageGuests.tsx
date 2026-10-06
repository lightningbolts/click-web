import { Users } from "lucide-react";
import { Avatar } from "@/components/ds/Avatar";
import { EmptyState } from "@/components/ds/EmptyState";
import { StatusPill } from "@/components/ds/StatusPill";
import { CopyTextButton } from "@/components/events/manage/CopyTextButton";
import { GuestListUpload } from "@/components/events/manage/GuestListUpload";
import { ManageRequests } from "@/components/events/manage/ManageRequests";
import type { EventAccess } from "@/lib/events/beaconManageAuth";
import {
  MANAGE_ATTENDEE_LIMIT,
  type ManageAttendee,
  type ManageGuestRsvp,
  type ManageRequest,
} from "@/lib/events/eventManageData";
import type { GuestListStatus } from "@/lib/events/guestListService";

type Row = {
  key: string;
  seed: string;
  name: string;
  avatar: string | null;
  status: "checked-in" | "going" | "guest";
  at: string | null;
  contact: string | null;
};

const STATUS: Record<Row["status"], { label: string; variant: "success" | "tinted" | "neutral" }> = {
  "checked-in": { label: "Checked in", variant: "success" },
  going: { label: "Going", variant: "tinted" },
  guest: { label: "Guest", variant: "neutral" },
};

/** One table for Click members and no-account guests, newest RSVP first. */
export function guestRows(attendees: ManageAttendee[], guests: ManageGuestRsvp[]): Row[] {
  const rows: Row[] = [
    ...attendees.map((a) => ({
      key: `u:${a.user_id}`,
      seed: a.user_id,
      name: a.name,
      avatar: a.avatar_url,
      status: a.checked_in ? ("checked-in" as const) : ("going" as const),
      at: a.rsvpd_at,
      contact: null,
    })),
    ...guests.map((g) => ({
      key: `g:${g.id}`,
      seed: g.id,
      name: g.name,
      avatar: null,
      status: "guest" as const,
      at: g.created_at || null,
      contact: g.contact,
    })),
  ];
  return rows.sort((a, b) => (b.at ? Date.parse(b.at) : 0) - (a.at ? Date.parse(a.at) : 0));
}

export function ManageGuests({
  beaconId,
  access,
  requests,
  attendees,
  guests,
  guestList,
  timeZone,
}: {
  beaconId: string;
  access: EventAccess;
  requests: ManageRequest[];
  attendees: ManageAttendee[];
  guests: ManageGuestRsvp[];
  guestList: GuestListStatus | null;
  timeZone: string | null;
}) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
  const when = (iso: string | null) => (iso && Number.isFinite(Date.parse(iso)) ? fmt.format(new Date(iso)) : "");
  const rows = guestRows(attendees, guests);
  const readOnly = access !== "manage";
  const requestTimes = Object.fromEntries(requests.map((r) => [r.user_id, `Asked ${when(r.created_at)}`]));

  return (
    <div className="flex flex-col gap-10" data-testid="manage-guests">
      <ManageRequests beaconId={beaconId} requests={requests} readOnly={readOnly} times={requestTimes} />

      <section aria-labelledby="manage-guest-table-heading">
        <h2 id="manage-guest-table-heading" className="type-headline mb-2 px-1 text-fg">
          Guests <span className="tabular text-fg-tertiary">{rows.length}</span>
        </h2>
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No guests yet"
            body="Share the event link. Everyone who RSVPs shows up here."
            headingLevel="h3"
            className="rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]"
          />
        ) : (
          <div className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
            <table className="w-full table-fixed text-left" data-testid="manage-guest-table">
              <thead className="type-meta text-fg-tertiary">
                <tr className="h-10">
                  <th scope="col" className="px-4 font-semibold">Name</th>
                  <th scope="col" className="w-28 px-2 font-semibold">Status</th>
                  <th scope="col" className="hidden w-40 px-2 font-semibold sm:table-cell">RSVP’d</th>
                  <th scope="col" className="w-12 px-2 sm:w-28">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="h-14 shadow-[inset_0_1px_0_var(--hairline)]">
                    <td className="px-4">
                      <span className="flex min-w-0 items-center gap-3">
                        <Avatar seed={r.seed} name={r.name} src={r.avatar} size={32} />
                        <span className="min-w-0">
                          <span className="type-body-strong block truncate text-fg">{r.name}</span>
                          {r.contact || r.at ? (
                            <span className="type-meta block truncate text-fg-tertiary">
                              {r.contact ?? <span className="sm:hidden">{when(r.at)}</span>}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </td>
                    <td className="px-2">
                      <StatusPill variant={STATUS[r.status].variant}>{STATUS[r.status].label}</StatusPill>
                    </td>
                    <td className="type-meta tabular hidden px-2 text-fg-secondary sm:table-cell">{when(r.at)}</td>
                    <td className="px-2 text-right">
                      {r.contact && !readOnly ? <CopyTextButton text={r.contact} label={`Copy ${r.name}’s contact`} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {attendees.length >= MANAGE_ATTENDEE_LIMIT ? (
          <p className="type-meta mt-2 px-1 text-fg-tertiary">Showing the {MANAGE_ATTENDEE_LIMIT} most recent Click RSVPs.</p>
        ) : null}
      </section>

      {readOnly ? null : <GuestListUpload beaconId={beaconId} initial={guestList} />}
    </div>
  );
}
