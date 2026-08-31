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
  it("renders options directly with styled toggles", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText("Visibility & access")).toBeInTheDocument();
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
    render(<Harness />);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Choose how close guests must be to the event pin to check in: Intimate 75 m, Neighborhood 250 m, Venue 750 m, or Campus 2.5 km.",
    );
  });

  it("offers an expanded taxonomy and custom categories", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole("button", { name: "Music" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volunteering" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Custom event category"), "Game night");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("button", { name: "Game night" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
