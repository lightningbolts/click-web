import { render, screen } from "@testing-library/react";
import { EventListCard } from "@/components/events/EventListCard";

jest.mock("@/components/ui/CardVisualSurface", () => ({
  CardVisualHero: ({ className }: { className?: string }) => (
    <div data-testid="event-thumb" className={className} />
  ),
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
    expect(screen.getByTestId("event-thumb")).toHaveClass("self-stretch");
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
    expect(screen.getByText("Time TBD")).toBeInTheDocument();
    expect(screen.queryByText("Location shared on the event page")).not.toBeInTheDocument();
  });

  it("hides a description that only repeats the title", () => {
    render(
      <EventListCard
        event={{
          beacon_id: "33333333-3333-4333-8333-333333333333",
          title: "Campus picnic",
          description: "Campus picnic",
          image_url: null,
          host_name: null,
          event_start_at: "2030-06-15T18:00:00.000Z",
          event_end_at: "2030-06-15T21:00:00.000Z",
          location_name: "The Quad",
          rsvp_count: 1,
          rsvp_enabled: true,
        }}
      />,
    );
    expect(screen.getAllByText("Campus picnic")).toHaveLength(1);
  });

  it("shows title before date and past-tense RSVP count", () => {
    render(
      <EventListCard
        event={{
          beacon_id: "44444444-4444-4444-8444-444444444444",
          title: "Alumni mixer",
          description: null,
          image_url: null,
          host_name: null,
          event_start_at: "2020-01-01T18:00:00.000Z",
          event_end_at: "2020-01-01T21:00:00.000Z",
          location_name: null,
          rsvp_count: 4,
          rsvp_enabled: true,
        }}
        past
      />,
    );

    const card = screen.getByTestId("event-list-card");
    const title = screen.getByText("Alumni mixer");
    const date = screen.getByText(/Jan/i);
    expect(card.textContent?.indexOf(title.textContent ?? "")).toBeLessThan(
      card.textContent?.indexOf(date.textContent ?? "") ?? 0,
    );
    expect(screen.getByText("4 went")).toBeInTheDocument();
  });

  it("exposes host edit and manage links without nesting them in the card link", () => {
    render(
      <EventListCard
        hostActions
        event={{
          beacon_id: "55555555-5555-4555-8555-555555555555",
          title: "Host mixer",
          description: null,
          image_url: null,
          host_name: null,
          event_start_at: "2030-06-15T18:00:00.000Z",
          event_end_at: "2030-06-15T21:00:00.000Z",
          location_name: null,
          rsvp_count: 2,
          rsvp_enabled: true,
        }}
      />,
    );
    const actions = screen.getByTestId("event-host-card-actions");
    expect(screen.getByRole("link", { name: "Edit details" })).toHaveAttribute(
      "href",
      "/e/55555555-5555-4555-8555-555555555555/edit",
    );
    expect(screen.getByRole("link", { name: "Host settings" })).toHaveAttribute(
      "href",
      "/e/55555555-5555-4555-8555-555555555555/manage",
    );
    expect(screen.getByTestId("event-list-card").contains(actions)).toBe(false);
  });
});
