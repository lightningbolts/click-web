import { render, screen } from "@testing-library/react";
import EventsPageBody from "@/components/events/EventsPageBody";

const authState: { user: { id: string } | null } = { user: null };

jest.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: authState.user }),
}));

jest.mock("@/components/dashboard/DashboardEventsModule", () => ({
  __esModule: true,
  default: () => <div data-testid="dashboard-events-module" />,
}));

jest.mock("@/components/events/PublicEventList", () => ({
  __esModule: true,
  default: () => <div data-testid="public-event-list" />,
}));

describe("EventsPageBody", () => {
  beforeEach(() => {
    authState.user = null;
  });

  it("shows only the public list when logged out", () => {
    render(
      <EventsPageBody
        upcomingEvents={[
          {
            beacon_id: "11111111-1111-4111-8111-111111111111",
            title: "Picnic",
            image_url: null,
            event_start_at: null,
            event_end_at: null,
            location_name: null,
          },
        ]}
        pastEvents={[]}
      />,
    );
    expect(screen.queryByTestId("dashboard-events-module")).not.toBeInTheDocument();
    expect(screen.queryByText("Discover")).not.toBeInTheDocument();
    expect(screen.getByTestId("public-event-list")).toBeInTheDocument();
  });

  it("shows your events then discover when signed in", () => {
    authState.user = { id: "u1" };
    render(
      <EventsPageBody
        upcomingEvents={[
          {
            beacon_id: "11111111-1111-4111-8111-111111111111",
            title: "Picnic",
            image_url: null,
            event_start_at: null,
            event_end_at: null,
            location_name: null,
          },
        ]}
        pastEvents={[]}
      />,
    );
    expect(screen.getByTestId("dashboard-events-module")).toBeInTheDocument();
    expect(screen.getByText("Discover")).toBeInTheDocument();
    expect(screen.getByTestId("public-event-list")).toBeInTheDocument();
  });
});
