import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManageRequests } from "@/components/events/manage/ManageRequests";
import type { ManageRequest } from "@/lib/events/eventManageData";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
jest.mock("@/lib/auth/freshAuthHeaders", () => ({ getFreshAuthHeaders: async () => ({ Authorization: "Bearer t" }) }));
const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/components/ds/Toast", () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}));

const requests: ManageRequest[] = [
  { user_id: "u1", name: "Ada Lovelace", avatar_url: null, status: "pending", created_at: "2026-10-01T10:00:00Z" },
  { user_id: "u2", name: "Grace Hopper", avatar_url: null, status: "waitlisted", created_at: "2026-10-01T11:00:00Z" },
];
const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe("ManageRequests (spec §7.6.4 Guests)", () => {
  it("shows names, not user ids, with a status pill", () => {
    render(<ManageRequests beaconId="b1" requests={requests} readOnly={false} times={{ u1: "Asked Oct 1" }} />);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Requested")).toBeInTheDocument();
    expect(screen.getByText("Waitlist")).toBeInTheDocument();
    expect(screen.queryByText("u1")).not.toBeInTheDocument();
  });

  it("approves the selection in bulk, hides handled rows and refreshes", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<ManageRequests beaconId="b1" requests={requests} readOnly={false} times={{}} />);
    const bulkApprove = screen.getByRole("button", { name: "Approve selected" });
    expect(bulkApprove).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Select all requests"));
    await userEvent.click(screen.getByRole("button", { name: "Approve 2 selected" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const bodies = mockFetch.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies).toEqual([
      { user_id: "u1", action: "approve" },
      { user_id: "u2", action: "approve" },
    ]);
    expect(toastSuccess).toHaveBeenCalledWith("Approved 2 requests");
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });

  it("reports partial failures and keeps failed rows", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    render(<ManageRequests beaconId="b1" requests={requests} readOnly={false} times={{}} />);
    await userEvent.click(screen.getByLabelText("Select all requests"));
    await userEvent.click(screen.getByRole("button", { name: "Decline 2 selected" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("1 request couldn’t be updated."));
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });

  it("is read-only for Place viewers", () => {
    render(<ManageRequests beaconId="b1" requests={requests} readOnly times={{}} />);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
