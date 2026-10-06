import { render, screen } from "@testing-library/react";
import { ManageInsights } from "@/components/events/manage/ManageInsights";
import { ManageRecap } from "@/components/events/manage/ManageRecap";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("@/lib/auth/freshAuthHeaders", () => ({ getFreshAuthHeaders: async () => ({}) }));
jest.mock("@/components/ds/Toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const summary = {
  beacon_id: "b1",
  connections_made: 4,
  check_in_count: 5,
  rsvp_count: 6,
  density: 0.8,
  repeat_reconnect_count: 1,
  new_pair_count: 3,
};
const counts = { going: 6, guests: 0, requests: 0, waitlist: 0, checkedIn: 5 };

describe("ManageInsights (spec §7.6.4: aggregate counts, each chart states n)", () => {
  it("states n on every chart and shows percentages in text", () => {
    render(<ManageInsights counts={counts} summary={summary} started />);
    expect(screen.getByText("n = 6 RSVPs")).toBeInTheDocument();
    expect(screen.getByText("n = 4 connections")).toBeInTheDocument();
    expect(screen.getByText("· 83%")).toBeInTheDocument();
    expect(screen.getByText("0.80")).toBeInTheDocument();
  });

  it("notes walk-ins rather than showing over 100%", () => {
    render(<ManageInsights counts={{ ...counts, going: 2, checkedIn: 5 }} summary={summary} started />);
    expect(screen.getByText("3 checked in without an RSVP.")).toBeInTheDocument();
    expect(screen.getByText("· 100%")).toBeInTheDocument();
  });

  it("shows an empty state before the event starts", () => {
    const empty = { ...summary, connections_made: 0 };
    render(<ManageInsights counts={{ ...counts, checkedIn: 0 }} summary={empty} started={false} />);
    expect(screen.getByText("Insights start with the event")).toBeInTheDocument();
    expect(screen.queryByTestId("manage-insights")).not.toBeInTheDocument();
  });
});

describe("ManageRecap (spec §7.6.4 Recap & summary)", () => {
  const unpublished = { published: false, token: null };

  it("lets managers publish and tells viewers who can", () => {
    const { rerender } = render(<ManageRecap beaconId="b1" access="manage" recap={null} summary={unpublished} />);
    expect(screen.getByRole("button", { name: "Publish summary" })).toBeInTheDocument();
    expect(screen.getByText("Not published")).toBeInTheDocument();
    rerender(<ManageRecap beaconId="b1" access="view" recap={null} summary={unpublished} />);
    expect(screen.queryByRole("button", { name: "Publish summary" })).not.toBeInTheDocument();
    expect(screen.getByText("A host or Place manager can publish it.")).toBeInTheDocument();
  });

  it("links the published summary with its token", () => {
    render(<ManageRecap beaconId="b1" access="view" recap={null} summary={{ published: true, token: "tok" }} />);
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open summary/ })).toHaveAttribute("href", "/e/b1/summary?token=tok");
    expect(screen.getByTestId("manage-summary-url").textContent).toMatch(/\/e\/b1\/summary\?token=tok$/);
  });

  it("hides the recap card when drops are off and links a ready recap", () => {
    const { rerender } = render(<ManageRecap beaconId="b1" access="manage" recap={null} summary={unpublished} />);
    expect(screen.queryByText("Recap")).not.toBeInTheDocument();
    rerender(
      <ManageRecap beaconId="b1" access="manage" recap={{ stage: "live", drops: 7, revealLabel: null }} summary={unpublished} />,
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("7 drops in the recap.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open recap/ })).toHaveAttribute("href", "/e/b1/recap");
  });

  it("explains when developing drops will be ready", () => {
    render(
      <ManageRecap beaconId="b1" access="manage" recap={{ stage: "developing", drops: 1, revealLabel: "Thu 9:00 AM" }} summary={unpublished} />,
    );
    expect(screen.getByText("1 drop developing, ready Thu 9:00 AM.")).toBeInTheDocument();
  });
});
