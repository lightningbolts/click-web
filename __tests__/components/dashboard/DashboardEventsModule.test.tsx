import { render, screen } from "@testing-library/react";
import DashboardEventsModule from "@/components/dashboard/DashboardEventsModule";
import { eventIsPast } from "@/lib/events/eventMetadata";

jest.mock("swr", () => ({
  __esModule: true,
  default: () => ({
    data: {
      events: [
        {
          beacon_id: "11111111-1111-4111-8111-111111111111",
          title: "Upcoming hosted",
          description: null,
          image_url: null,
          event_start_at: "2030-06-15T18:00:00.000Z",
          event_end_at: "2030-06-15T21:00:00.000Z",
          location_name: "Park",
          rsvp_count: 2,
          rsvp_enabled: true,
          role: "creator",
        },
        {
          beacon_id: "22222222-2222-4222-8222-222222222222",
          title: "Upcoming RSVP",
          description: null,
          image_url: null,
          event_start_at: "2030-06-16T18:00:00.000Z",
          event_end_at: "2030-06-16T21:00:00.000Z",
          location_name: "Cafe",
          rsvp_count: 3,
          rsvp_enabled: true,
          role: "rsvp",
        },
        {
          beacon_id: "33333333-3333-4333-8333-333333333333",
          title: "Past attended",
          description: null,
          image_url: null,
          event_start_at: "2020-01-01T18:00:00.000Z",
          event_end_at: "2020-01-01T21:00:00.000Z",
          location_name: "Hall",
          rsvp_count: 5,
          rsvp_enabled: true,
          role: "rsvp",
        },
      ],
    },
    error: undefined,
    isLoading: false,
  }),
}));

jest.mock("@/components/events/EventListCard", () => ({
  EventListCard: ({ event, past }: { event: { title: string }; past?: boolean }) => (
    <div data-testid="event-list-card" data-past={past ? "true" : "false"}>
      {event.title}
    </div>
  ),
}));

describe("DashboardEventsModule", () => {
  it("splits upcoming and past events into hosted and attended sections", () => {
    render(<DashboardEventsModule />);
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Past")).toBeInTheDocument();
    expect(screen.getByText("Upcoming hosted")).toBeInTheDocument();
    expect(screen.getByText("Attending")).toBeInTheDocument();
    expect(screen.getByText("Upcoming RSVP")).toBeInTheDocument();
    expect(screen.getByText("Past attended")).toBeInTheDocument();
    expect(screen.getByText("Past attended").closest("[data-testid='event-list-card']")).toHaveAttribute(
      "data-past",
      "true",
    );
  });
});

describe("eventIsPast", () => {
  it("treats ended events as past", () => {
    expect(
      eventIsPast({
        event_start_at: "2020-01-01T18:00:00.000Z",
        event_end_at: "2020-01-01T21:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("treats a start-only event as past after the grace window", () => {
    expect(
      eventIsPast(
        {
          event_start_at: "2030-06-15T18:00:00.000Z",
          event_end_at: null,
        },
        Date.parse("2030-06-16T01:00:01.000Z"),
      ),
    ).toBe(true);
  });
});
