import { render, screen } from "@testing-library/react";
import AboutPage from "@/app/about/page";

describe("AboutPage", () => {
  it("uses human copy and keeps the Maestro heading id", () => {
    render(<AboutPage />);
    expect(screen.getByTestId("about-heading")).toHaveTextContent("We kept meeting people and losing them");
    expect(screen.getByText(/University of Washington/)).toBeInTheDocument();
    expect(screen.queryByText(/room-real/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tri-Factor Handshake/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try the demo" })).toHaveAttribute("href", "/#how-it-works");
    expect(screen.queryByText(/—/)).not.toBeInTheDocument();
    expect(screen.queryByText(/another scroll/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/a little less lonely/i)).not.toBeInTheDocument();
  });
});
