import { act, render, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import type { User } from "@supabase/supabase-js";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
}));

// Null while mounting keeps the provider's effects inert; a test can swap a client in afterwards.
let mockClient: unknown = null;
jest.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => mockClient,
}));

function Probe() {
  const { user, loading, signOut } = useAuth();
  return (
    <div>
      <span data-testid="auth-user">{user?.email ?? "none"}</span>
      <span data-testid="auth-loading">{String(loading)}</span>
      <button onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}

describe("AuthProvider", () => {
  it("uses a server-resolved user on the first render", () => {
    const initialUser = {
      id: "user-1",
      email: "ada@example.com",
      user_metadata: { full_name: "Ada Lovelace" },
    } as unknown as User;

    render(
      <AuthProvider initialUser={initialUser}>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("auth-user")).toHaveTextContent("ada@example.com");
    expect(screen.getByTestId("auth-loading")).toHaveTextContent("false");
  });

  it("signs out of this browser only, leaving the account's other devices signed in", async () => {
    const initialUser = { id: "user-1", email: "ada@example.com", user_metadata: {} } as unknown as User;
    render(
      <AuthProvider initialUser={initialUser}>
        <Probe />
      </AuthProvider>,
    );
    const signOut = jest.fn().mockResolvedValue({ error: null });
    mockClient = { auth: { signOut } };
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await act(async () => screen.getByRole("button", { name: "Sign out" }).click());

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(screen.getByTestId("auth-user")).toHaveTextContent("none");
  });
});
