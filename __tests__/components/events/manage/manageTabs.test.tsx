import { render, screen } from "@testing-library/react";
import { guestRows, ManageGuests } from "@/components/events/manage/ManageGuests";
import { manageTabs } from "@/components/events/manage/ManageHeader";
import { ManageOverview, manageNextSteps } from "@/components/events/manage/ManageOverview";
import { publicEventFixture } from "@/__tests__/helpers/publicEventFixture";
import { recapStage } from "@/components/events/manage/ManageRecap";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }), usePathname: () => "/" }));
jest.mock("@/lib/auth/freshAuthHeaders", () => ({ getFreshAuthHeaders: async () => ({}) }));
jest.mock("@/components/ds/Toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const counts = { going: 3, guests: 1, requests: 2, waitlist: 1, checkedIn: 0 };

describe("manage tabs (spec §7.6.4)", () => {
  it("hides Edit from read-only viewers", () => {
    expect(manageTabs("b1", "manage").map((t) => t.label)).toEqual(["Overview", "Guests", "Edit", "Insights", "Recap & summary"]);
    expect(manageTabs("b1", "view").map((t) => t.href)).not.toContain("/e/b1/manage/edit");
  });

  it("adds Tickets only for ticketed events", () => {
    expect(manageTabs("b1", "manage", true).map((t) => t.label)).toEqual(["Overview", "Guests", "Tickets", "Edit", "Insights", "Recap & summary"]);
    expect(manageTabs("b1", "view", false).map((t) => t.label)).not.toContain("Tickets");
  });

  it("sums up ticket sales on the overview of a ticketed event", () => {
    const sales = { sold: 87, capacity: 120, checked_in: 42, gross_cents: 130500, refunded_cents: 0, net_cents: 0, refundable_orders: 0, currency: "usd", tiers: [] };
    const event = publicEventFixture({ beacon_id: "b1" });
    const { rerender } = render(<ManageOverview event={event} counts={counts} access="manage" ended={false} summaryPublished={false} sales={sales} />);
    const card = screen.getByRole("region", { name: "Tickets" });
    expect(card).toHaveTextContent("87 / 120");
    expect(card).toHaveTextContent("$1,305");
    expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/e/b1/manage/tickets");
    rerender(<ManageOverview event={event} counts={counts} access="manage" ended={false} summaryPublished={false} />);
    expect(screen.queryByRole("region", { name: "Tickets" })).not.toBeInTheDocument();
  });

  it("orders next steps by urgency and switches after the event", () => {
    const upcoming = manageNextSteps({ beaconId: "b1", counts, ended: false, hasCover: false, summaryPublished: false });
    expect(upcoming.map((s) => s.title)).toEqual(["Review 3 requests", "Scan Click Passes", "Add a cover photo", "Seed the room", "Edit details"]);
    const past = manageNextSteps({ beaconId: "b1", counts: { ...counts, requests: 0, waitlist: 0 }, ended: true, hasCover: true, summaryPublished: true });
    expect(past.map((s) => s.href)).toEqual(["/e/b1/manage/insights"]);
  });

  it("derives the recap stage from the drop schedule", () => {
    const s = { opensAtMs: 10, closesAtMs: 20, revealAtMs: 30 };
    expect([5, 15, 25, 35].map((t) => recapStage(t, s))).toEqual(["before", "open", "developing", "live"]);
    expect(recapStage(100, null)).toBe("before");
  });

  it("merges Click and guest RSVPs newest first", () => {
    const rows = guestRows(
      [{ user_id: "u1", name: "Ada", avatar_url: null, rsvpd_at: "2026-10-01T10:00:00Z", checked_in: true }],
      [{ id: "g1", name: "Sam", contact: "sam@x.co", created_at: "2026-10-02T10:00:00Z" }],
    );
    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ["Sam", "guest"],
      ["Ada", "checked-in"],
    ]);
  });

  it("hides contacts and the guest-list upload from viewers", () => {
    const props = {
      beaconId: "b1",
      requests: [],
      attendees: [],
      guests: [{ id: "g1", name: "Sam", contact: null, created_at: "2026-10-02T10:00:00Z" }],
      guestList: null,
      timeZone: "America/New_York",
    };
    const { rerender } = render(<ManageGuests {...props} access="view" />);
    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.queryByTestId("guest-list-upload")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contact/ })).not.toBeInTheDocument();
    rerender(<ManageGuests {...props} guests={[{ ...props.guests[0], contact: "sam@x.co" }]} access="manage" />);
    expect(screen.getByText("sam@x.co")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Sam’s contact" })).toBeInTheDocument();
    expect(screen.getByTestId("guest-list-upload")).toBeInTheDocument();
  });
});
