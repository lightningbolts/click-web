import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventRsvpPanel from "@/components/events/EventRsvpPanel";

const authState: { user: { id: string } | null; loading: boolean } = { user: null, loading: false };
const swrState: {
  data?: {
    current_user_signed_up?: boolean;
    attendees?: Array<{ user_id: string; name: string; avatar_url: string | null }>;
    rsvp_count?: number;
  };
  isLoading: boolean;
} = {
  data: undefined,
  isLoading: false,
};

jest.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading }),
}));

jest.mock("@/lib/auth/freshAuthHeaders", () => ({
  getFreshAuthHeaders: async () => ({}),
}));

const mutateMock = jest.fn();
jest.mock("swr", () => ({
  __esModule: true,
  default: () => ({ data: swrState.data, isLoading: swrState.isLoading }),
  mutate: (...args: unknown[]) => mutateMock(...args),
}));

describe("EventRsvpPanel", () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
    swrState.data = undefined;
    swrState.isLoading = false;
    mutateMock.mockReset();
    global.fetch = jest.fn();
  });

  it("shows the guest form when signed out", () => {
    render(<EventRsvpPanel beaconId="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByTestId("guest-rsvp-form")).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.queryByTestId("account-rsvp-panel")).not.toBeInTheDocument();
  });

  it("does not flash an RSVP button while the signed-in status is loading", () => {
    authState.user = { id: "user-1" };
    swrState.isLoading = true;
    render(<EventRsvpPanel beaconId="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByTestId("account-rsvp-panel")).toBeInTheDocument();
    expect(screen.getByText(/Checking your RSVP/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "RSVP" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel RSVP" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("guest-rsvp-form")).not.toBeInTheDocument();
  });

  it("RSVPs with the Click account when signed in and not going", () => {
    authState.user = { id: "user-1" };
    swrState.data = { current_user_signed_up: false };
    render(<EventRsvpPanel beaconId="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByTestId("account-rsvp-panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RSVP" })).toBeInTheDocument();
    expect(screen.queryByTestId("guest-rsvp-form")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
  });

  it("shows Cancel RSVP immediately when the server already knows the viewer is going", () => {
    authState.loading = true;
    render(
      <EventRsvpPanel
        beaconId="11111111-1111-4111-8111-111111111111"
        initialViewer={{ kind: "member", going: true }}
      />,
    );
    expect(screen.getByTestId("event-state-going")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel RSVP" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "RSVP" })).not.toBeInTheDocument();
  });

  it("shows the guest form immediately when the server already knows the viewer is signed out", () => {
    authState.loading = true;
    render(
      <EventRsvpPanel
        beaconId="11111111-1111-4111-8111-111111111111"
        initialViewer={{ kind: "guest" }}
      />,
    );
    expect(screen.getByTestId("guest-rsvp-form")).toBeInTheDocument();
    expect(screen.queryByText(/Checking your RSVP/i)).not.toBeInTheDocument();
  });

  it("shows RSVP immediately when the server already knows the viewer is not going", () => {
    authState.user = { id: "user-1" };
    authState.loading = true;
    render(
      <EventRsvpPanel
        beaconId="11111111-1111-4111-8111-111111111111"
        initialViewer={{ kind: "member", going: false }}
      />,
    );
    expect(screen.getByRole("button", { name: "RSVP" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel RSVP" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Checking your RSVP/i)).not.toBeInTheDocument();
  });

  it("does not ask for contact details after a signed-in RSVP", () => {
    authState.user = { id: "user-1" };
    swrState.data = { current_user_signed_up: true };
    render(<EventRsvpPanel beaconId="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByTestId("event-state-going")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel RSVP" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
  });

  it("asks the host for approval when the listing requires it", () => {
    authState.user = { id: "user-1" };
    swrState.data = { current_user_signed_up: false };
    render(
      <EventRsvpPanel
        beaconId="11111111-1111-4111-8111-111111111111"
        listing={{
          event_visibility: "public",
          event_capacity: null,
          approval_required: true,
          guest_list_visibility: "public",
          cover_theme_id: null,
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Request to join" })).toBeInTheDocument();
  });

  it("writes the new attendee into the shared RSVP cache without a page reload", async () => {
    const user = userEvent.setup();
    authState.user = { id: "user-1" };
    swrState.data = { current_user_signed_up: false, attendees: [], rsvp_count: 0 };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        attendee: { user_id: "user-1", name: "Ada", avatar_url: null },
      }),
    });

    render(<EventRsvpPanel beaconId="11111111-1111-4111-8111-111111111111" />);
    await user.click(screen.getByRole("button", { name: "RSVP" }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    const updater = mutateMock.mock.calls[0][1] as (current?: {
      attendees?: Array<{ user_id: string; name: string; avatar_url: string | null }>;
      rsvp_count?: number;
      current_user_signed_up?: boolean;
    }) => {
      attendees?: Array<{ user_id: string; name: string; avatar_url: string | null }>;
      rsvp_count?: number;
      current_user_signed_up?: boolean;
    };
    const next = updater({ attendees: [], rsvp_count: 2, current_user_signed_up: false });
    expect(next.attendees).toEqual([{ user_id: "user-1", name: "Ada", avatar_url: null }]);
    expect(next.rsvp_count).toBe(3);
  });
});
