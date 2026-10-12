import { render, screen } from "@testing-library/react";
import Footer from "@/components/Footer";

jest.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
jest.mock("@/lib/shell/ProductChromeContext", () => ({ useProductChrome: () => false }));

describe("Footer", () => {
  afterEach(() => jest.useRealTimers());

  it("shows the current year, whatever year it is", () => {
    jest.useFakeTimers().setSystemTime(new Date("2031-03-01T12:00:00Z"));
    render(<Footer />);
    expect(screen.getByText("© 2031 Click")).toBeInTheDocument();
  });

  it("links every public page", () => {
    render(<Footer />);
    const nav = screen.getByRole("navigation", { name: "Footer" });
    for (const href of ["/events", "/enterprise", "/about", "/careers", "/privacy", "/terms"]) {
      expect(nav.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });
});
