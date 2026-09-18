import { render, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => null,
}));

function Probe() {
  const { user, loading } = useAuth();
  return (
    <div>
      <span data-testid="auth-user">{user?.email ?? "none"}</span>
      <span data-testid="auth-loading">{String(loading)}</span>
    </div>
  );
}

describe("AuthProvider", () => {
  it("uses a server-resolved user on the first render", () => {
    const initialUser = {
      id: "user-1",
      email: "ada@example.com",
      user_metadata: { full_name: "Ada Lovelace" },
    } as any;

    render(
      <AuthProvider initialUser={initialUser}>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("auth-user")).toHaveTextContent("ada@example.com");
    expect(screen.getByTestId("auth-loading")).toHaveTextContent("false");
  });
});
