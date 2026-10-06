import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import EventForm from "@/components/events/EventForm";
import type { EventFormDraft } from "@/lib/events/eventFormDraft";

const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

let mockUser: { id: string } | null = { id: "u1" };
jest.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: mockUser, loading: false }) }));

jest.mock("@/lib/auth/freshAuthHeaders", () => ({
  getFreshAuthHeaders: async () => ({ "Content-Type": "application/json" }),
  fetchWithFreshAuth: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
  authFailureMessage: (_status: number, fallback: string) => fallback,
}));

const toastSuccess = jest.fn();
jest.mock("@/components/ds/Toast", () => ({ toast: { success: (m: string) => toastSuccess(m), error: jest.fn() } }));

// The real picker geocodes and lazy-loads a map; a plain input keeps these tests on the form.
jest.mock("@/components/events/EventLocationPicker", () => ({
  __esModule: true,
  default: (p: {
    inputId: string;
    locationName: string;
    onLocationNameChange: (v: string) => void;
    onCoordsChange: (lat: string, lng: string) => void;
    onBlur?: () => void;
    invalid?: boolean;
  }) => (
    <>
      <input
        id={p.inputId}
        aria-label="Location"
        aria-invalid={p.invalid || undefined}
        value={p.locationName}
        onChange={(e) => p.onLocationNameChange(e.target.value)}
        onBlur={p.onBlur}
      />
      <button type="button" onClick={() => p.onCoordsChange("40.7", "-74")}>
        Pin
      </button>
    </>
  ),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// 2030-06-15 17:20 UTC = 13:20 in New York.
const NOW = Date.UTC(2030, 5, 15, 17, 20);

const json = (status: number, body: unknown) => Promise.resolve({ ok: status < 400, status, json: async () => body });

function setup(props: Partial<React.ComponentProps<typeof EventForm>> = {}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <EventForm defaultTimeZone="America/New_York" nowMs={NOW} {...props} />
    </SWRConfig>,
  );
}

const draft: EventFormDraft = {
  title: "Campus picnic",
  description: "Bring a blanket",
  startIso: "2030-06-15T18:00:00.000Z",
  endIso: "2030-06-15T21:00:00.000Z",
  timeZone: "America/Los_Angeles",
  locationName: "The Quad",
  lat: "47.655",
  lng: "-122.308",
  imageUrl: null,
  coverThemeId: "",
  visibility: "public",
  capacity: 40,
  approvalRequired: false,
  guestListVisibility: "public",
  showCreatorName: true,
  venueScale: "neighborhood",
  categories: ["Social", "Food & Drink", "Music", "Arts"],
};

function lastBody(): Record<string, unknown> {
  const call = mockFetch.mock.calls.find(([url]) => String(url).startsWith("/api/beacons"));
  return JSON.parse(String(call?.[1]?.body));
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string) =>
    url === "/api/places/mine" ? json(200, { places: [] }) : json(200, { beacon: { id: "new-id" } }),
  );
  push.mockReset();
  refresh.mockReset();
  toastSuccess.mockReset();
  mockUser = { id: "u1" };
});

describe("EventForm", () => {
  it("defaults to the next whole hour in the viewer's zone, two hours long", () => {
    setup();
    expect(screen.getByTestId("event-create-form")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Event name")).toBeInTheDocument();
    expect(screen.getByLabelText("Start date")).toHaveValue("2030-06-15");
    expect(screen.getByLabelText("Start time")).toHaveValue("14:00");
    expect(screen.getByLabelText("End time")).toHaveValue("16:00");
    expect(screen.getByLabelText("Time zone")).toHaveValue("America/New_York");
    expect(screen.getByRole("button", { name: "Create event" })).toBeInTheDocument();
    expect(screen.getByLabelText("Repeats")).toBeInTheDocument();
  });

  it("shows a field's error on blur, not before", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByText("Give your event a name.")).not.toBeInTheDocument();
    await user.click(screen.getByPlaceholderText("Event name"));
    await user.tab();
    expect(screen.getByText("Give your event a name.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Event name")).toHaveAttribute("aria-describedby", "event-title-error");
  });

  it("on a failed submit focuses the first error and posts nothing", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Create event" }));
    expect(screen.getByPlaceholderText("Event name")).toHaveFocus();
    expect(screen.getByText("Fix the 2 highlighted fields to continue.")).toBeInTheDocument();
    expect(mockFetch.mock.calls.some(([url]) => url === "/api/beacons")).toBe(false);
  });

  it("creates the event in the chosen zone and opens its page", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText("Event name"), "Rooftop jam");
    await user.type(screen.getByLabelText("Location"), "Pier 17");
    await user.click(screen.getByRole("button", { name: "Pin" }));
    // Same wall clock, different zone: 14:00 in Los Angeles.
    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "America/Los_Angeles" } });
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/e/new-id"));
    expect(toastSuccess).toHaveBeenCalledWith("Event created");
    const body = lastBody();
    expect(body.kind).toBe("event");
    expect(body.event_timezone).toBe("America/Los_Angeles");
    expect(body.cover_theme_id).toBe("theme:purple");
    expect(body).not.toHaveProperty("venue_id");
    const meta = body.metadata as Record<string, unknown>;
    expect(meta.event_start_at).toBe("2030-06-15T21:00:00.000Z");
    expect(meta.event_end_at).toBe("2030-06-15T23:00:00.000Z");
    expect(meta.title).toBe("Rooftop jam");
  });

  it("moving the start keeps the event's length", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "18:30" } });
    expect(screen.getByLabelText("End time")).toHaveValue("20:30");
  });

  it("toasts the series size for a repeating event", async () => {
    mockFetch.mockImplementation((url: string) =>
      url === "/api/places/mine" ? json(200, { places: [] }) : json(200, { beacon: { id: "s1" }, series_count: 4 }),
    );
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText("Event name"), "Weekly run");
    await user.type(screen.getByLabelText("Location"), "Park");
    await user.click(screen.getByRole("button", { name: "Pin" }));
    fireEvent.change(screen.getByLabelText("Repeats"), { target: { value: "weekly" } });
    await user.click(screen.getByRole("button", { name: "Create event" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("4 events created"));
    expect(lastBody().recurrence).toEqual({ frequency: "weekly", count: 4 });
  });

  it("offers only writable Places as hosts and honors ?host=place:{id}", async () => {
    mockFetch.mockImplementation((url: string) =>
      url === "/api/places/mine"
        ? json(200, {
            places: [
              { id: "p-own", name: "Corner Café", role: "owner", latitude: 40.7, longitude: -74, address_line: "1 Main St", timezone: "America/Chicago", photo_url: null },
              { id: "p-view", name: "Viewer Bar", role: "viewer", latitude: 1, longitude: 1, address_line: null, timezone: "UTC", photo_url: null },
            ],
          })
        : json(200, { beacon: { id: "e1" } }),
    );
    const user = userEvent.setup();
    setup({ initialHostPlaceId: "p-own" });
    const host = await screen.findByLabelText("Host as");
    expect(host).toHaveValue("p-own");
    expect(screen.getByRole("option", { name: "Corner Café" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Viewer Bar" })).not.toBeInTheDocument();
    // The Place fills in where and its zone.
    expect(screen.getByLabelText("Location")).toHaveValue("Corner Café, 1 Main St");
    expect(screen.getByLabelText("Time zone")).toHaveValue("America/Chicago");

    await user.type(screen.getByPlaceholderText("Event name"), "Open mic");
    await user.click(screen.getByRole("button", { name: "Create event" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/e/e1"));
    expect(lastBody().venue_id).toBe("p-own");
  });

  it("ignores a ?host Place the viewer can only view", async () => {
    mockFetch.mockImplementation((url: string) =>
      url === "/api/places/mine"
        ? json(200, { places: [{ id: "p-view", name: "Viewer Bar", role: "viewer", latitude: 1, longitude: 1, timezone: "UTC" }] })
        : json(200, {}),
    );
    setup({ initialHostPlaceId: "p-view" });
    await act(async () => {});
    expect(screen.queryByLabelText("Host as")).not.toBeInTheDocument();
  });

  it("edits in place: keeps the event's zone, hides Repeats and Host as, PATCHes", async () => {
    const user = userEvent.setup();
    setup({ beaconId: "11111111-1111-4111-8111-111111111111", initial: draft });
    expect(screen.getByDisplayValue("Campus picnic")).toBeInTheDocument();
    expect(screen.getByLabelText("Start time")).toHaveValue("11:00");
    expect(screen.getByLabelText("Capacity")).toHaveValue(40);
    expect(screen.queryByLabelText("Repeats")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Host as")).not.toBeInTheDocument();
    expect(mockFetch.mock.calls.some(([url]) => url === "/api/places/mine")).toBe(false);
    // No theme on the event: nothing is selected and nothing is written.
    expect(screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent)).toEqual(
      expect.not.arrayContaining(["Purple"]),
    );
    mockFetch.mockImplementation(() => json(200, { beacon: { id: "11111111-1111-4111-8111-111111111111" } }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/e/11111111-1111-4111-8111-111111111111"));
    expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
    const body = lastBody();
    expect(body).not.toHaveProperty("cover_theme_id");
    expect(body).not.toHaveProperty("venue_id");
    expect((body.metadata as Record<string, unknown>).event_start_at).toBe("2030-06-15T18:00:00.000Z");
    expect(toastSuccess).toHaveBeenCalledWith("Changes saved");
  });

  it("caps categories at three but keeps older extras removable", async () => {
    const user = userEvent.setup();
    setup({ beaconId: "11111111-1111-4111-8111-111111111111", initial: draft });
    expect(screen.getByRole("button", { name: "Tech" })).toBeDisabled();
    // "Food & Drink" predates the iOS list; it stays as a removable chip.
    await user.click(screen.getByRole("button", { name: "Food & Drink" }));
    expect(screen.getByRole("button", { name: "Tech" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Arts" }));
    expect(screen.getByRole("button", { name: "Tech" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Tech" }));
    expect(screen.getByRole("button", { name: "Gaming" })).toBeDisabled();
  });

  it("shows a server error without leaving the page", async () => {
    mockFetch.mockImplementation((url: string) =>
      url === "/api/places/mine" ? json(200, { places: [] }) : json(403, { error: "Viewers can't create events for this Place" }),
    );
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText("Event name"), "X");
    await user.type(screen.getByLabelText("Location"), "Y");
    await user.click(screen.getByRole("button", { name: "Pin" }));
    await user.click(screen.getByRole("button", { name: "Create event" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Viewers can't create events for this Place");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows cover upload errors", async () => {
    mockFetch.mockImplementation((url: string) =>
      url === "/api/places/mine" ? json(200, { places: [] }) : json(400, { error: "Storage upload failed" }),
    );
    const user = userEvent.setup();
    setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([new Uint8Array(1200)], "cover.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Storage upload failed");
  });
});
