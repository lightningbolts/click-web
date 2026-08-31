import { render, screen } from "@testing-library/react";
import EventGoingAvatars from "@/components/events/EventGoingAvatars";

jest.mock("@/components/ui/AvatarStack", () => ({
  AvatarStack: ({
    items,
    maxVisible,
    label,
  }: {
    items: unknown[];
    maxVisible: number;
    label: string;
  }) => (
    <div data-testid="avatar-stack" data-items={items.length} data-max-visible={maxVisible}>
      {label}
    </div>
  ),
}));

describe("EventGoingAvatars", () => {
  it("keeps attendee avatars in dense dashboard cards", () => {
    render(
      <EventGoingAvatars
        dense
        count={3}
        people={[
          { user_id: "a", name: "A" },
          { user_id: "b", name: "B" },
          { user_id: "c", name: "C" },
        ]}
      />,
    );

    expect(screen.getByTestId("avatar-stack")).toHaveAttribute("data-items", "3");
    expect(screen.getByTestId("avatar-stack")).toHaveAttribute("data-max-visible", "2");
  });
});
