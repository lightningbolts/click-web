import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventBackLink from "@/components/events/EventBackLink";

const push = jest.fn();
const authState = { user: null as { id: string } | null };

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: authState.user }),
}));

describe("EventBackLink", () => {
  beforeEach(() => {
    push.mockReset();
    authState.user = null;
  });

  it("opens the public events list when coming from /events", async () => {
    const user = userEvent.setup();
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: `${window.location.origin}/events`,
    });
    render(<EventBackLink />);
    await user.click(screen.getByTestId("event-back-link"));
    expect(push).toHaveBeenCalledWith("/events");
  });

  it("opens the events list when signed in from the dashboard", async () => {
    const user = userEvent.setup();
    authState.user = { id: "u1" };
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: `${window.location.origin}/`,
    });
    render(<EventBackLink />);
    await user.click(screen.getByTestId("event-back-link"));
    expect(push).toHaveBeenCalledWith("/events");
  });

  it("uses an explicit href on manage and edit", async () => {
    const user = userEvent.setup();
    render(<EventBackLink href="/e/abc" />);
    await user.click(screen.getByTestId("event-back-link"));
    expect(push).toHaveBeenCalledWith("/e/abc");
  });

  it("opens the events list when there is no same-origin history", async () => {
    const user = userEvent.setup();
    Object.defineProperty(document, "referrer", { configurable: true, value: "" });
    render(<EventBackLink />);
    await user.click(screen.getByTestId("event-back-link"));
    expect(push).toHaveBeenCalledWith("/events");
  });
});
