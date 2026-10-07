import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventCalendarMenu } from "@/components/events/EventCalendarMenu";

const event = {
  id: "e4c5d43b-6f32-41e5-9010-896ce503fc45",
  title: "Run Club",
  startAt: "2026-10-10T17:00:00Z",
  endAt: "2026-10-10T19:00:00Z",
  location: "Burke-Gilman Trail",
  description: null,
  url: "https://joinclick.co/e/e4c5d43b-6f32-41e5-9010-896ce503fc45",
};

describe("EventCalendarMenu", () => {
  it("opens to real links for Google, .ics and Outlook", async () => {
    const user = userEvent.setup();
    render(<EventCalendarMenu event={event} />);
    await user.click(screen.getByRole("button", { name: "Add to calendar" }));

    const google = await screen.findByRole("menuitem", { name: "Google Calendar" });
    expect(google.tagName).toBe("A");
    expect(google).toHaveAttribute("href", expect.stringContaining("calendar.google.com"));
    expect(screen.getByRole("menuitem", { name: "Apple Calendar (.ics)" })).toHaveAttribute(
      "href",
      `/e/${event.id}/calendar.ics`,
    );
    expect(screen.getByRole("menuitem", { name: "Outlook" })).toHaveAttribute(
      "href",
      expect.stringContaining("outlook.live.com"),
    );
  });
});
