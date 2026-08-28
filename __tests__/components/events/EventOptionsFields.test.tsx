import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventOptionsFields from "@/components/events/EventOptionsFields";
import { DEFAULT_EVENT_LISTING_OPTIONS } from "@/lib/events/eventOptions";

function Harness() {
  const [visibility, setVisibility] = useState(DEFAULT_EVENT_LISTING_OPTIONS.event_visibility);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [guestListVisibility, setGuestListVisibility] = useState<"public" | "hosts_only">("public");
  const [showCreatorName, setShowCreatorName] = useState(true);
  const [venueScale, setVenueScale] = useState<"intimate" | "neighborhood" | "venue" | "campus">(
    "neighborhood",
  );
  const [categories, setCategories] = useState<string[]>([]);

  return (
    <EventOptionsFields
      visibility={visibility}
      capacity={capacity}
      approvalRequired={approvalRequired}
      guestListVisibility={guestListVisibility}
      showCreatorName={showCreatorName}
      venueScale={venueScale}
      categories={categories}
      onVisibility={setVisibility}
      onCapacity={setCapacity}
      onApproval={setApprovalRequired}
      onGuestListVisibility={setGuestListVisibility}
      onShowCreatorName={setShowCreatorName}
      onVenueScale={setVenueScale}
      onCategories={setCategories}
    />
  );
}

describe("EventOptionsFields", () => {
  it("renders subcards and toggles instead of checkboxes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Event options"));

    expect(screen.getByText("Visibility & Access")).toBeInTheDocument();
    expect(screen.getByText("Capacity")).toBeInTheDocument();
    expect(screen.getByText("Check-in area")).toBeInTheDocument();
    expect(screen.getByText("Categories")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    const approval = screen.getByRole("switch", { name: "Approval required" });
    expect(approval).toHaveAttribute("aria-checked", "false");
    await user.click(approval);
    expect(approval).toHaveAttribute("aria-checked", "true");
  });

  it("shows check-in area tooltip copy", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Event options"));
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Check-in area sets the geofencing radius an attendee must be within to check in to the event — Intimate/Neighborhood/Venue/Campus map to increasingly large check-in radii.",
    );
  });
});
