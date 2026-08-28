import { ConnectionPeerAvatar } from "@/components/dashboard/ConnectionPeerAvatar";
import { cn } from "@/lib/cn";

export type EventGoingPerson = {
  user_id?: string;
  name: string;
  avatar_url?: string | null;
};

export default function EventGoingAvatars({
  people,
  count,
  className,
  onOpen,
}: {
  people: EventGoingPerson[];
  count: number;
  className?: string;
  onOpen?: () => void;
}) {
  const shown = people.slice(0, 5);
  const label = `${count} going`;
  const inner = (
    <>
      {shown.length > 0 ? (
        <span className="flex -space-x-2">
          {shown.map((person, index) => (
            <ConnectionPeerAvatar
              key={person.user_id || `${person.name}-${index}`}
              label={person.name}
              imageUrl={person.avatar_url}
              size="sm"
              className="ring-2 ring-surface"
            />
          ))}
        </span>
      ) : null}
      <span>{label}</span>
    </>
  );
  if (!onOpen) {
    return (
      <span className={cn("inline-flex items-center gap-2 text-sm font-semibold text-secondary", className)}>
        {inner}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "inline-flex items-center gap-2 text-sm font-semibold text-secondary hover:underline",
        className,
      )}
    >
      {inner}
    </button>
  );
}
