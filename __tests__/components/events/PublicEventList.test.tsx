import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PublicEventList, { groupFor } from "@/components/events/PublicEventList";

jest.mock("@/components/events/EventListCard", () => ({
  EventListCard: ({ event, past }: { event: { title: string }; past?: boolean }) => (
    <div data-testid="event-list-card" data-past={past ? "true" : "false"}>
      {event.title}
    </div>
  ),
}));

const upcomingEvents = [
  {
    beacon_id: "11111111-1111-4111-8111-111111111111",
    title: "Soonest picnic",
    description: null,
    image_url: null,
    host_name: "Jordan",
    event_start_at: "2030-06-15T18:00:00.000Z",
    event_end_at: "2030-06-15T21:00:00.000Z",
    location_name: "Park",
    rsvp_count: 5,
    rsvp_enabled: true,
  },
  {
    beacon_id: "22222222-2222-4222-8222-222222222222",
    title: "Later meetup",
    description: null,
    image_url: null,
    host_name: "Alex",
    event_start_at: "2030-07-01T18:00:00.000Z",
    event_end_at: "2030-07-01T21:00:00.000Z",
    location_name: "Hall",
    rsvp_count: 2,
    rsvp_enabled: true,
  },
];

const pastEvents = [
  {
    beacon_id: "33333333-3333-4333-8333-333333333333",
    title: "Old hangout",
    description: null,
    image_url: null,
    host_name: "Sam",
    event_start_at: "2020-01-01T18:00:00.000Z",
    event_end_at: "2020-01-01T21:00:00.000Z",
    location_name: "Cafe",
    rsvp_count: 8,
    rsvp_enabled: true,
  },
];

describe("PublicEventList", () => {
  it("groups calendar days in the event timezone", () => {
    const now = new Date("2030-06-16T06:30:00.000Z");
    const eventStart = "2030-06-16T07:30:00.000Z";

    expect(groupFor(eventStart, "America/Los_Angeles", now)).toBe("week");
    expect(groupFor(eventStart, "UTC", now)).toBe("today");
  });

  it("exposes an accessible Upcoming/Past toggle", async () => {
    const user = userEvent.setup();
    render(<PublicEventList upcomingEvents={upcomingEvents} pastEvents={pastEvents} />);

    const upcomingTab = screen.getByRole("tab", { name: "Upcoming" });
    const pastTab = screen.getByRole("tab", { name: "Past events" });
    expect(upcomingTab).toHaveAttribute("aria-selected", "true");
    expect(pastTab).toHaveAttribute("aria-selected", "false");

    await user.click(pastTab);
    expect(pastTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Old hangout")).toBeInTheDocument();
    expect(screen.getAllByTestId("event-list-card")[0]).toHaveAttribute("data-past", "true");
  });

  it("uses sort chips for going and host", async () => {
    const user = userEvent.setup();
    render(<PublicEventList upcomingEvents={upcomingEvents} pastEvents={pastEvents} />);

    const going = screen.getByRole("button", { name: "Going" });
    await user.click(going);
    expect(going.className).toContain("bg-primary");
  });
});
