import { render, screen } from "@testing-library/react";
import AuthenticatedProductShell from "@/components/shell/AuthenticatedProductShell";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";

const authState: { user: { email: string; user_metadata: Record<string, string> } | null } = {
  user: null,
};

jest.mock("next/navigation", () => ({
  usePathname: () => "/events",
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({
    user: authState.user,
    signOut: jest.fn(),
    profileImageUrl: null,
  }),
}));

jest.mock("swr", () => ({
  __esModule: true,
  default: () => ({ data: { insightsAllowed: false } }),
}));

describe("AuthenticatedProductShell", () => {
  beforeEach(() => {
    authState.user = null;
  });

  it("renders children without a second product chrome when logged out", () => {
    render(
      <ThemeProvider>
        <AuthenticatedProductShell>
          <p>Public event</p>
        </AuthenticatedProductShell>
      </ThemeProvider>,
    );
    expect(screen.getByText("Public event")).toBeInTheDocument();
    expect(screen.queryByTestId("event-product-shell")).not.toBeInTheDocument();
  });

  it("renders children without a stacked sidebar when signed in", () => {
    authState.user = { email: "ada@example.com", user_metadata: { full_name: "Ada Lovelace" } };
    render(
      <ThemeProvider>
        <AuthenticatedProductShell>
          <p>Public event</p>
        </AuthenticatedProductShell>
      </ThemeProvider>,
    );
    expect(screen.queryByTestId("event-product-shell")).not.toBeInTheDocument();
    expect(screen.getByText("Public event")).toBeInTheDocument();
  });
});
