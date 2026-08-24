import { render, screen } from "@testing-library/react";
import { EventListCard } from "@/components/events/EventListCard";

jest.mock("@/components/ui/CardVisualSurface", () => ({
  CardVisualHero: () => <div data-testid="event-thumb" />,
}));

describe("EventListCard", () => {
  it("shows title, description, host, location, and RSVP count", () => {
    render(
      <EventListCard
        event={{
          beacon_id: "11111111-1111-4111-8111-111111111111",
          title: "Campus picnic",
          description: "Bring a blanket and a snack to share on the lawn.",
          image_url: null,
          host_name: "Jordan Lee",
          event_start_at: "2030-06-15T18:00:00.000Z",
          event_end_at: "2030-06-15T21:00:00.000Z",
          location_name: "Cal Anderson Park",
          rsvp_count: 12,
          rsvp_enabled: true,
        }}
      />,
    );

    expect(screen.getByTestId("event-list-card")).toHaveAttribute(
      "href",
      "/e/11111111-1111-4111-8111-111111111111",
    );
    expect(screen.getByText("Campus picnic")).toBeInTheDocument();
    expect(screen.getByText(/Bring a blanket/)).toBeInTheDocument();
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();
    expect(screen.getByText("Cal Anderson Park")).toBeInTheDocument();
    expect(screen.getByText("12 going")).toBeInTheDocument();
  });

  it("hides RSVP count when RSVP is disabled", () => {
    render(
      <EventListCard
        event={{
          beacon_id: "22222222-2222-4222-8222-222222222222",
          title: "Quiet reading hour",
          description: null,
          image_url: null,
          host_name: null,
          event_start_at: null,
          event_end_at: null,
          location_name: null,
          rsvp_count: 3,
          rsvp_enabled: false,
        }}
      />,
    );

    expect(screen.getByText("Quiet reading hour")).toBeInTheDocument();
    expect(screen.queryByText(/going/)).not.toBeInTheDocument();
    expect(screen.getByText("Time to be announced")).toBeInTheDocument();
  });
});
