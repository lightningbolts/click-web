import { render, screen } from "@testing-library/react";
import EventRouteLoading from "@/components/events/EventRouteLoading";

describe("EventRouteLoading", () => {
  it("renders a list skeleton for the events feed", () => {
    render(<EventRouteLoading variant="list" />);
    expect(screen.getByTestId("event-route-loading")).toHaveAttribute("aria-label", "Loading events");
  });

  it("renders a detail skeleton for a specific event", () => {
    render(<EventRouteLoading variant="detail" />);
    expect(screen.getByTestId("event-route-loading")).toHaveAttribute("aria-label", "Loading event");
  });
});
