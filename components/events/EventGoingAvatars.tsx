import { AvatarStack } from "@/components/ui/AvatarStack";

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
  past = false,
  dense = false,
}: {
  people: EventGoingPerson[];
  count: number;
  className?: string;
  onOpen?: () => void;
  past?: boolean;
  dense?: boolean;
}) {
  const label = `${count} ${past ? "went" : "going"}`;
  return (
    <AvatarStack
      items={
        dense
          ? []
          : people.map((person) => ({
              id: person.user_id,
              label: person.name,
              imageUrl: person.avatar_url,
            }))
      }
      count={count}
      label={label}
      maxVisible={5}
      showOverflow={false}
      className={className}
      onClick={onOpen}
    />
  );
}
