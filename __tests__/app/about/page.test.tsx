import { render, screen } from "@testing-library/react";
import AboutPage from "@/app/about/page";

describe("AboutPage", () => {
  it("uses human copy and keeps the Maestro heading id", () => {
    render(<AboutPage />);
    expect(screen.getByTestId("about-heading")).toHaveTextContent("About Click");
    expect(screen.getByText(/University of Washington/)).toBeInTheDocument();
    expect(screen.queryByText(/room-real/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tri-Factor Handshake/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /homepage/i })).toHaveAttribute("href", "/");
    expect(screen.queryByText(/—/)).not.toBeInTheDocument();
    expect(screen.queryByText(/another scroll/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/a little less lonely/i)).not.toBeInTheDocument();
  });
});
