import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookOpen, MapPin } from "lucide-react";
import ProductAppShell from "@/components/shell/ProductAppShell";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";

const navState = { pathname: "/" };

jest.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
}));

function renderShell(
  override: Partial<React.ComponentProps<typeof ProductAppShell>> = {},
) {
  return render(
    <ThemeProvider>
      <ProductAppShell
        productLabel="Click"
        productHref="/"
        items={[
          { id: "memory", label: "Memory Box", icon: BookOpen },
          { id: "map", label: "Map", icon: MapPin },
        ]}
        activeId="memory"
        title="Welcome"
        subtitle="Your digital memory box"
        rootTestId="dashboard-root"
        chromeTestId="dashboard-chrome"
        itemTestIdPrefix="dashboard-tab"
        {...override}
      >
        <p>Shell body</p>
      </ProductAppShell>
    </ThemeProvider>,
  );
}

describe("ProductAppShell", () => {
  beforeEach(() => {
    navState.pathname = "/";
  });

  it("renders a vertical nav with the active item marked current", () => {
    renderShell();
    expect(screen.getByTestId("dashboard-root")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-chrome")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-tab-memory")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("dashboard-tab-map")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Shell body")).toBeInTheDocument();
  });

  it("keeps a navbar measurement hook on the mobile header", () => {
    renderShell();
    expect(document.querySelector('[data-navbar-root="true"]')).toBeInTheDocument();
  });

  it("calls onSelect when a button item is chosen", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    renderShell({ onSelect });
    await user.click(screen.getByTestId("dashboard-tab-map"));
    expect(onSelect).toHaveBeenCalledWith("map");
  });

  it("locks the pane and hides the title when fillViewport and hideHeader are set", () => {
    renderShell({ fillViewport: true, hideHeader: true, title: "Welcome" });
    expect(screen.getByTestId("dashboard-root")).toHaveAttribute("data-fill-viewport", "true");
    expect(screen.queryByRole("heading", { name: "Welcome" })).not.toBeInTheDocument();
    expect(screen.getByText("Shell body")).toBeInTheDocument();
  });

  it("marks a linked item active from the pathname", () => {
    navState.pathname = "/insights/heatmap";
    renderShell({
      activeId: undefined,
      items: [
        { id: "overview", label: "Overview", icon: BookOpen, href: "/insights", exact: true },
        { id: "heatmap", label: "Heatmap", icon: MapPin, href: "/insights/heatmap" },
      ],
      itemTestIdPrefix: "insights-nav",
    });
    expect(screen.getByTestId("insights-nav-heatmap")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("insights-nav-overview")).not.toHaveAttribute("aria-current");
  });

  it("renders the user avatar beside the sidebar label when provided", () => {
    renderShell({ userLabel: "Alice", userAvatarUrl: "https://cdn.example/avatar.png" });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-chrome").querySelector('img[src="https://cdn.example/avatar.png"]')).toBeTruthy();
  });
});
