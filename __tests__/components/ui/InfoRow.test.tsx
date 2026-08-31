import { render, screen } from "@testing-library/react";
import { InfoRow } from "@/components/ui/InfoRow";

describe("InfoRow", () => {
  it("renders title, description, and children", () => {
    render(
      <InfoRow title="Approval required" description="Hosts vet Click RSVPs.">
        <span>Toggle slot</span>
      </InfoRow>,
    );
    expect(screen.getByText("Approval required")).toBeInTheDocument();
    expect(screen.getByText("Hosts vet Click RSVPs.")).toBeInTheDocument();
    expect(screen.getByText("Toggle slot")).toBeInTheDocument();
  });

  it("exposes tooltip help for check-in area", () => {
    render(
      <InfoRow
        title="Check-in area"
        tooltip="Check-in area sets the geofencing radius an attendee must be within to check in to the event — Intimate/Neighborhood/Venue/Campus map to increasingly large check-in radii."
      />,
    );
    expect(
      screen.getByRole("button", { name: "More about Check-in area" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent(/geofencing radius/i);
  });
});
