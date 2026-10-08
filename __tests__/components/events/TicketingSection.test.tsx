import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { TicketingSection } from "@/components/events/tickets/TicketingSection";
import type { ManagedTier } from "@/lib/ticketing/types";

const mockClient = {
  fetchManagedTiers: jest.fn(),
  createTier: jest.fn(),
  updateTier: jest.fn(),
  deleteTier: jest.fn(),
  setTicketingStatus: jest.fn(),
  connectOnboardingUrl: jest.fn(),
};
const mockToast = { success: jest.fn(), error: jest.fn() };
const mockAssign = jest.fn();

jest.mock("@/components/ds/useMediaQuery", () => ({ useMediaQuery: () => true }));
jest.mock("@/components/ds/Toast", () => ({ toast: { success: (m: string) => mockToast.success(m), error: (m: string) => mockToast.error(m) } }));
jest.mock("@/lib/navigation/assignLocation", () => ({ assignLocation: (url: string) => mockAssign(url) }));
jest.mock("@/lib/ticketing/ticketingClient", () => {
  const actual = jest.requireActual("@/lib/ticketing/ticketingClient");
  const forward =
    (name: keyof typeof mockClient) =>
    (...args: unknown[]) =>
      mockClient[name](...args);
  return {
    ...actual,
    fetchManagedTiers: forward("fetchManagedTiers"),
    createTier: forward("createTier"),
    updateTier: forward("updateTier"),
    deleteTier: forward("deleteTier"),
    setTicketingStatus: forward("setTicketingStatus"),
    connectOnboardingUrl: forward("connectOnboardingUrl"),
  };
});

const EVENT = "11111111-1111-4111-8111-111111111111";
const tier = (over: Partial<ManagedTier> = {}): ManagedTier => ({
  id: "t1",
  name: "General",
  description: null,
  unit_amount: 1500,
  currency: "usd",
  availability: "on_sale",
  remaining: 100,
  max_quantity: 8,
  sales_start_at: null,
  sales_end_at: null,
  capacity: 100,
  sold: 0,
  held: 0,
  checked_in: 0,
  is_active: true,
  max_per_order: 8,
  max_per_user: null,
  sort_order: 0,
  ...over,
});

function renderSection(props: Partial<React.ComponentProps<typeof TicketingSection>> = {}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TicketingSection timeZone="America/Los_Angeles" hasPaidAccount {...props} />
    </SWRConfig>,
  );
}

const toggle = () => screen.getByRole("switch", { name: "Sell or hand out tickets" });

describe("TicketingSection", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("on a new event", () => {
    it("starts off and drafts ticket types in place", async () => {
      const onDraftsChange = jest.fn();
      renderSection({ onDraftsChange });
      expect(toggle()).not.toBeChecked();
      await userEvent.click(toggle());
      expect(toggle()).toBeChecked();
      await userEvent.click(screen.getByRole("button", { name: "Add ticket type" }));
      const sheet = await screen.findByRole("dialog");
      await userEvent.type(within(sheet).getByLabelText("Name"), "Early bird");
      await userEvent.type(within(sheet).getByLabelText("Price"), "12");
      await userEvent.type(within(sheet).getByLabelText("Capacity"), "50");
      await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByText("Early bird")).toBeInTheDocument();
      expect(onDraftsChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: "Early bird", priceText: "12", capacityText: "50" })]);
      expect(mockClient.createTier).not.toHaveBeenCalled();
    });

    it("shows what to fix instead of closing", async () => {
      renderSection();
      await userEvent.click(toggle());
      await userEvent.click(screen.getByRole("button", { name: "Add ticket type" }));
      const sheet = await screen.findByRole("dialog");
      await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
      expect(within(sheet).getByText("Name your ticket")).toBeInTheDocument();
      expect(within(sheet).getByText("Capacity must be at least 1")).toBeInTheDocument();
    });

    it("explains why a repeating event can't sell tickets", () => {
      renderSection({ disabledReason: "Repeating events can’t sell tickets yet." });
      expect(toggle()).toBeDisabled();
      expect(screen.getByText("Repeating events can’t sell tickets yet.")).toBeInTheDocument();
    });
  });

  describe("on a saved event", () => {
    it("lists its ticket types", async () => {
      mockClient.fetchManagedTiers.mockResolvedValue([tier({ sold: 10, held: 2 })]);
      renderSection({ beaconId: EVENT, initialStatus: "sales_open" });
      expect(await screen.findByText("General")).toBeInTheDocument();
      expect(toggle()).toBeChecked();
      expect(screen.getByText(/88 \/ 100 left/)).toBeInTheDocument();
      expect(screen.getByText(/\$15\.00/)).toBeInTheDocument();
    });

    it("saves an edited ticket type", async () => {
      mockClient.fetchManagedTiers.mockResolvedValue([tier()]);
      mockClient.updateTier.mockResolvedValue({ ok: true });
      renderSection({ beaconId: EVENT, initialStatus: "sales_open" });
      await userEvent.click(await screen.findByRole("button", { name: "Edit General" }));
      const sheet = await screen.findByRole("dialog");
      const price = within(sheet).getByLabelText("Price");
      await userEvent.clear(price);
      await userEvent.type(price, "18");
      await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
      await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith("Ticket saved"));
      expect(mockClient.updateTier).toHaveBeenCalledWith(EVENT, "t1", expect.objectContaining({ unit_amount: 1800, capacity: 100 }));
    });

    it("hides, rather than deletes, a ticket type with sales", async () => {
      mockClient.fetchManagedTiers.mockResolvedValue([tier({ id: "t1", sold: 3 }), tier({ id: "t2", name: "VIP" })]);
      renderSection({ beaconId: EVENT, initialStatus: "sales_open" });
      expect(await screen.findByRole("button", { name: "Hide General" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete General" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete VIP" })).toBeInTheDocument();
      expect(screen.getByText("Ticket types with sales can be hidden, not deleted.")).toBeInTheDocument();
    });

    it("asks for payouts before paid tickets can sell", async () => {
      mockClient.fetchManagedTiers.mockResolvedValue([tier()]);
      mockClient.connectOnboardingUrl.mockResolvedValue("https://connect.stripe.com/setup/x");
      renderSection({ beaconId: EVENT, hasPaidAccount: false, initialStatus: "draft" });
      expect(await screen.findByText("Set up payouts to sell paid tickets")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Set up payouts" }));
      await waitFor(() => expect(mockAssign).toHaveBeenCalledWith("https://connect.stripe.com/setup/x"));
    });

    it("opens, pauses and closes sales", async () => {
      mockClient.fetchManagedTiers.mockResolvedValue([tier()]);
      mockClient.setTicketingStatus.mockResolvedValue({ ticketing_status: "sales_paused" });
      renderSection({ beaconId: EVENT, initialStatus: "sales_open" });
      await screen.findByText("General");
      await userEvent.click(screen.getByRole("radio", { name: "Paused" }));
      expect(mockClient.setTicketingStatus).toHaveBeenCalledWith(EVENT, "sales_paused");
      await waitFor(() => expect(screen.getByRole("radio", { name: "Paused" })).toHaveAttribute("aria-checked", "true"));
    });

    it("can't be switched off once tickets are out", async () => {
      mockClient.fetchManagedTiers.mockResolvedValue([tier({ sold: 1 })]);
      renderSection({ beaconId: EVENT, initialStatus: "sales_open" });
      await screen.findByText("General");
      expect(toggle()).toBeDisabled();
      expect(screen.getByText("Tickets have been issued, so ticketing can’t be turned off.")).toBeInTheDocument();
    });
  });
});
