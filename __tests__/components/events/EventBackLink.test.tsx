import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventBackLink from "@/components/events/EventBackLink";

const back = jest.fn();
const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ back, push }),
}));

describe("EventBackLink", () => {
  beforeEach(() => {
    back.mockReset();
    push.mockReset();
  });

  it("goes back when the previous page is on this origin", async () => {
    const user = userEvent.setup();
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: `${window.location.origin}/events`,
    });
    render(<EventBackLink />);
    await user.click(screen.getByTestId("event-back-link"));
    expect(back).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("opens the events list when there is no same-origin history", async () => {
    const user = userEvent.setup();
    Object.defineProperty(document, "referrer", { configurable: true, value: "" });
    Object.defineProperty(window, "history", {
      configurable: true,
      value: { length: 1 },
    });
    render(<EventBackLink />);
    await user.click(screen.getByTestId("event-back-link"));
    expect(push).toHaveBeenCalledWith("/events");
  });
});
