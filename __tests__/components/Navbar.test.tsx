import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Navbar from "@/components/Navbar";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";

const navState: {
  pathname: string;
  tab: string | null;
  user: { email: string; user_metadata: Record<string, string> } | null;
  loading: boolean;
} = {
  pathname: "/about",
  tab: null,
  user: null,
  loading: false,
};

jest.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(navState.tab ? `tab=${navState.tab}` : ""),
}));

jest.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({
    user: navState.user,
    signOut: jest.fn(),
    loading: navState.loading,
  }),
}));

jest.mock("swr", () => ({
  __esModule: true,
  default: () => ({ data: { insightsAllowed: true } }),
}));

jest.mock("@/components/LoginModal", () => ({
  __esModule: true,
  default: () => null,
}));

function renderNav() {
  return render(
    <ThemeProvider>
      <Navbar />
    </ThemeProvider>,
  );
}

describe("Navbar", () => {
  beforeEach(() => {
    navState.pathname = "/about";
    navState.tab = null;
    navState.user = null;
    navState.loading = false;
  });

  it("hides on insights routes", () => {
    navState.pathname = "/insights";
    const { container } = renderNav();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows product tabs on the signed-in dashboard", () => {
    navState.pathname = "/";
    navState.user = { email: "ada@example.com", user_metadata: { full_name: "Ada Lovelace" } };
    renderNav();
    expect(screen.getByTestId("dashboard-tab-memory")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("dashboard-tab-events")).toHaveAttribute("href", "/events");
    expect(screen.getByTestId("nav-menu-toggle")).toBeInTheDocument();
  });

  it("shows product tabs on signed-in event routes with Events current", () => {
    navState.pathname = "/events";
    navState.user = { email: "ada@example.com", user_metadata: { full_name: "Ada Lovelace" } };
    renderNav();
    expect(screen.getByTestId("dashboard-tab-events")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("dashboard-tab-memory")).not.toHaveAttribute("aria-current");
  });

  it("shows a login CTA when logged out on marketing pages", () => {
    renderNav();
    const logo = screen.getByRole("link", { name: /lick/i });
    const login = screen.getByTestId("nav-login");
    expect(login).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute("href", "/events");
    expect(logo.compareDocumentPosition(login) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("treats page links as text, not a second primary button", () => {
    navState.pathname = "/events";
    renderNav();
    const events = screen.getByRole("link", { name: "Events" });
    expect(events).toHaveClass("text-primary");
    expect(events).not.toHaveClass("bg-primary-container");
    expect(events).not.toHaveClass("fc-btn-primary");
    expect(screen.getByRole("button", { name: "How it works" })).not.toHaveClass("fc-btn-primary");
    expect(screen.getByTestId("nav-login")).toHaveClass("fc-btn-primary");
  });

  it("keeps signed-in actions as one CTA plus matching icon controls", () => {
    navState.pathname = "/about";
    navState.user = { email: "ada@example.com", user_metadata: { full_name: "Ada Lovelace" } };
    renderNav();
    const create = screen.getByRole("link", { name: "Create event" });
    expect(create).toHaveClass("fc-btn-primary");
    expect(create).toHaveClass("h-9");
    expect(screen.getByTestId("dashboard-tab-memory")).toHaveAttribute("href", "/?tab=memory");
    expect(screen.getByTestId("dashboard-tab-memory")).not.toHaveClass("fc-btn-primary");
    const accountButton = screen.getByRole("button", { name: /Ada Lovelace/i });
    expect(accountButton).toHaveClass("h-9");
    expect(accountButton).toHaveClass("leading-snug");
    expect(accountButton).not.toHaveClass("leading-none");
  });

  it("opens a user menu with sign out as a button", async () => {
    const user = userEvent.setup();
    navState.user = { email: "ada@example.com", user_metadata: { full_name: "Ada Lovelace" } };
    renderNav();
    await user.click(screen.getByRole("button", { name: /Ada Lovelace/i }));
    expect(screen.getByTestId("nav-sign-out")).toBeInTheDocument();
    expect(screen.getByTestId("nav-sign-out").tagName).toBe("BUTTON");
  });

  it("animates the mobile drawer open and closed", async () => {
    const user = userEvent.setup();
    renderNav();
    const drawer = screen.getByTestId("mobile-nav-drawer");
    expect(drawer).toHaveAttribute("data-open", "false");
    expect(drawer.className).toContain("translate-x-full");
    await user.click(screen.getByTestId("nav-menu-toggle"));
    expect(drawer).toHaveAttribute("data-open", "true");
    expect(drawer.className).toContain("translate-x-0");
    await user.click(screen.getByTestId("nav-menu-toggle"));
    await waitFor(() => {
      expect(drawer).toHaveAttribute("data-open", "false");
    });
  });

  it("holds the login slot while auth is loading instead of flashing Login", () => {
    navState.loading = true;
    renderNav();
    expect(screen.getByTestId("nav-auth-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-login")).not.toBeInTheDocument();
  });
});
