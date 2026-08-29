import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Navbar from "@/components/Navbar";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { ProductChromeOn, ProductChromeProvider } from "@/lib/shell/ProductChromeContext";

const navState: {
  pathname: string;
  user: { email: string; user_metadata: Record<string, string> } | null;
  loading: boolean;
} = {
  pathname: "/about",
  user: null,
  loading: false,
};

jest.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
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
    navState.user = null;
    navState.loading = false;
  });

  it("hides marketing chrome on insights routes", () => {
    navState.pathname = "/insights";
    const { container } = renderNav();
    expect(container).toBeEmptyDOMElement();
  });

  it("hides marketing chrome on the signed-in dashboard", () => {
    navState.pathname = "/";
    navState.user = { email: "ada@example.com", user_metadata: { full_name: "Ada Lovelace" } };
    const { container } = renderNav();
    expect(container).toBeEmptyDOMElement();
  });

  it("hides marketing chrome on signed-in event routes", () => {
    navState.pathname = "/events";
    navState.user = { email: "ada@example.com", user_metadata: { full_name: "Ada Lovelace" } };
    const { container } = renderNav();
    expect(container).toBeEmptyDOMElement();
  });

  it("hides marketing chrome when product chrome is mounted even if client session is empty", async () => {
    navState.pathname = "/";
    navState.user = null;
    render(
      <ThemeProvider>
        <ProductChromeProvider>
          <ProductChromeOn />
          <Navbar />
        </ProductChromeProvider>
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(screen.queryByTestId("nav-login")).not.toBeInTheDocument();
    });
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
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveClass("fc-btn-primary");
    const accountButton = screen.getByRole("button", { name: /Ada Lovelace/i });
    expect(accountButton).toHaveClass("h-9");
    expect(accountButton).toHaveClass("leading-snug");
    expect(accountButton).not.toHaveClass("leading-none");
  });

  it("opens a user menu with dashboard and sign out", async () => {
    const user = userEvent.setup();
    navState.user = { email: "ada@example.com", user_metadata: { full_name: "Ada Lovelace" } };
    renderNav();
    await user.click(screen.getByRole("button", { name: /Ada Lovelace/i }));
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("nav-sign-out")).toBeInTheDocument();
  });

  it("holds the login slot while auth is loading instead of flashing Login", () => {
    navState.loading = true;
    renderNav();
    expect(screen.getByTestId("nav-auth-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-login")).not.toBeInTheDocument();
  });
});
