import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Navbar from "@/components/Navbar";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";

const navState: { pathname: string; user: { email: string; user_metadata: Record<string, string> } | null } = {
  pathname: "/about",
  user: null,
};

jest.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({
    user: navState.user,
    signOut: jest.fn(),
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

  it("shows a login CTA when logged out on marketing pages", () => {
    renderNav();
    expect(screen.getByTestId("nav-login")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute("href", "/events");
  });

  it("opens a user menu with dashboard and sign out", async () => {
    const user = userEvent.setup();
    navState.user = { email: "ada@example.com", user_metadata: { full_name: "Ada Lovelace" } };
    renderNav();
    await user.click(screen.getByRole("button", { name: /Ada Lovelace/i }));
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("nav-sign-out")).toBeInTheDocument();
  });
});
