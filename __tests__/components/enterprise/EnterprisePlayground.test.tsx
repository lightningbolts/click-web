import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EnterprisePlayground from "@/components/enterprise/EnterprisePlayground";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";

describe("EnterprisePlayground", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("walks the sample Place's Insights sections on sample data without requests", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <EnterprisePlayground />
      </ThemeProvider>,
    );
    const nav = within(screen.getByRole("navigation", { name: "Insights sections" }));
    expect(nav.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(/Demo data/)).toBeInTheDocument();
    expect(await screen.findByText("Social Sticky Score")).toBeInTheDocument();
    expect(screen.getByText("joinclick.co/business/places/demo/insights")).toBeInTheDocument();

    await user.click(nav.getByRole("button", { name: "Events" }));
    expect(screen.getByTestId("enterprise-section-events")).toHaveTextContent(
      "Which events turn RSVPs into check-ins?",
    );
    expect(screen.getByText("joinclick.co/business/places/demo/insights/events")).toBeInTheDocument();
    expect(screen.queryByText(/Connection Velocity|Tri-Factor Handshake/i)).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
