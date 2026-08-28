import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventDateTimeFields from "@/components/events/EventDateTimeFields";
import { defaultEventWindow } from "@/lib/events/eventScheduleUi";

function Harness() {
  const initial = defaultEventWindow(new Date("2030-06-15T12:00:00"));
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  return (
    <EventDateTimeFields
      start={start}
      end={end}
      timeZone="America/Los_Angeles"
      onStartChange={setStart}
      onEndChange={setEnd}
    />
  );
}

describe("EventDateTimeFields", () => {
  it("keeps hidden ISO fields and opens schedule popovers", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByTestId("event-datetime-fields")).toBeInTheDocument();
    expect(document.querySelector('[name="event_start_at"]')).not.toBeNull();
    expect(document.querySelector('[name="event_end_at"]')).not.toBeNull();
    expect(screen.getByText(/America\/Los Angeles/i)).toBeInTheDocument();

    const starts = screen.getByRole("button", { name: "Starts date and time" });
    await user.click(starts);
    expect(starts).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Hour")).toBeInTheDocument();
  });

  it("closes popover on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const starts = screen.getByRole("button", { name: "Starts date and time" });
    await user.click(starts);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
