import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as maplibregl from "maplibre-gl";
import LandingPlayground from "@/components/landing/playground";
import ThemeToggle from "@/components/ThemeToggle";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";

jest.mock("@/components/landing/playground/PlaygroundMapLazy", () => ({
  __esModule: true,
  default: require("@/components/landing/playground/PlaygroundMap").default,
}));

function renderPlayground() {
  render(
    <ThemeProvider>
      <ThemeToggle />
      <LandingPlayground />
    </ThemeProvider>,
  );
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

const phone = () => within(screen.getByTestId("demo-phone"));
const web = () => within(screen.getByTestId("demo-web"));
const phoneThread = () => within(screen.getByTestId("phone-route-thread"));

describe("LandingPlayground", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    expect(global.fetch).not.toHaveBeenCalled();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("taps to connect with Jordan, then says hi from the result screen", async () => {
    const user = renderPlayground();
    await user.click(screen.getByTestId("guide-tap"));
    expect(screen.getByTestId("phone-route-tap")).toHaveTextContent("Hold phones together");

    // Three co-presence checks, one at a time.
    for (let i = 0; i < 4; i++) act(() => jest.advanceTimersByTime(450));
    expect(screen.getByTestId("tap-result")).toHaveTextContent("Jordan");
    expect(screen.getByRole("button", { name: "Tap to Connect with Jordan, done" })).toBeInTheDocument();

    await user.click(phone().getByRole("button", { name: "Say hi" }));
    expect(phoneThread().getByTestId("say-hi")).toBeInTheDocument();
    // A new Click is a say-hi thread on the web too.
    await user.click(screen.getByTestId("web-nav-clicks"));
    expect(web().getByTestId("thread-row-jordan")).toHaveTextContent("48h left");
    await user.type(phoneThread().getByRole("textbox", { name: "Message" }), "Hey!");
    await user.click(phoneThread().getByRole("button", { name: "Send" }));
    expect(screen.getByRole("button", { name: "Say hi before the 48 hours are up, done" })).toBeInTheDocument();
  });

  it("sends a message on the phone that shows on the web, then gets a reply", async () => {
    const user = renderPlayground();
    await user.click(screen.getByTestId("guide-hi"));
    await user.type(phoneThread().getByRole("textbox", { name: "Message" }), "Coffee soon?");
    await user.click(phoneThread().getByRole("button", { name: "Send" }));

    expect(within(screen.getByTestId("web-thread")).getByText("Coffee soon?")).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1500));
    expect(phoneThread().getByText("Sounds good to me")).toBeInTheDocument();
  });

  it("hides the iPhone tab bar inside a thread and brings it back on Back", async () => {
    const user = renderPlayground();
    await user.click(screen.getByTestId("phone-tab-clicks"));
    await user.click(phone().getByTestId("thread-row-maya"));
    expect(screen.queryByRole("navigation", { name: "iPhone tabs" })).not.toBeInTheDocument();
    await user.click(phone().getByRole("button", { name: /^Back/ }));
    expect(screen.getByRole("navigation", { name: "iPhone tabs" })).toBeInTheDocument();
  });

  it("sends a plan that lands in Upcoming on both devices", async () => {
    const user = renderPlayground();
    await user.click(screen.getByTestId("guide-plan"));
    await user.click(phoneThread().getByTestId("composer-plan"));

    const cards = screen.getAllByTestId("plan-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole("button", { name: "Going" })).toHaveAttribute("aria-pressed", "true");

    await user.click(phone().getByRole("button", { name: /^Back/ }));
    await user.click(screen.getByTestId("phone-tab-home"));
    await user.click(screen.getByTestId("web-nav-home"));
    for (const upcoming of screen.getAllByTestId("upcoming")) expect(upcoming).toHaveTextContent("Coffee with Maya");
  });

  it("keeps RSVP and save separate, syncs RSVP to the web and resets everything", async () => {
    const user = renderPlayground();
    await user.click(screen.getByTestId("guide-rsvp"));
    const phoneEvent = within(screen.getByTestId("phone-route-event"));
    await user.click(phoneEvent.getByRole("button", { name: "Save event" }));
    expect(phoneEvent.getByTestId("rsvp-mixer")).toHaveAttribute("aria-pressed", "false");

    await user.click(phoneEvent.getByTestId("rsvp-mixer"));
    expect(web().getByTestId("rsvp-mixer")).toHaveTextContent("You’re going");

    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByText("0 of 5 done")).toBeInTheDocument();
    await user.click(screen.getByTestId("web-nav-events"));
    await user.click(web().getByRole("button", { name: /Dawg Daze Mixer/ }));
    expect(web().getByTestId("rsvp-mixer")).toHaveTextContent("RSVP");
    expect(web().getByRole("button", { name: "Save event" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shares availability between the phone and the web", async () => {
    const user = renderPlayground();
    await user.click(screen.getByTestId("guide-intent"));
    await user.click(within(screen.getByTestId("phone-route-availability")).getByRole("button", { name: "Walk" }));
    await user.click(web().getByRole("button", { name: "Your profile" }));
    expect(web().getByTestId("me-content")).toHaveTextContent("Coffee, Walk");
  });

  it("creates a group and joins a hub from Add", async () => {
    const user = renderPlayground();
    await user.click(screen.getByTestId("phone-tab-add"));
    await user.click(phone().getByRole("button", { name: /Group/ }));
    await user.click(phone().getByRole("button", { name: "Create group" }));
    expect(screen.getByTestId("phone-route-thread")).toBeInTheDocument();

    await user.click(phone().getByRole("button", { name: /^Back/ }));
    await user.click(screen.getByTestId("phone-tab-add"));
    await user.click(phone().getByRole("button", { name: /Join hub/ }));
    await user.click(within(screen.getByTestId("phone-route-hub")).getByRole("button", { name: "Join hub" }));
    expect(phoneThread().getByRole("list", { name: "Messages" })).toBeInTheDocument();
  });

  it("renders a real QR code on My QR", async () => {
    const user = renderPlayground();
    await user.click(screen.getByTestId("phone-tab-add"));
    await user.click(phone().getByRole("button", { name: /My QR/ }));
    expect(phone().getByTitle("Click QR code for Alex Rivera")).toBeInTheDocument();
  });

  it("maps Clicks and events offline, and restyles without remounting on theme change", async () => {
    const user = renderPlayground();
    await user.click(screen.getByTestId("web-nav-map"));
    act(() => jest.advanceTimersByTime(3000));
    await waitFor(() => expect(screen.getAllByTestId("playground-map-pin").length).toBeGreaterThan(0));

    const mapMock = maplibregl.Map as unknown as jest.Mock;
    const options = mapMock.mock.calls[0][0] as {
      style: unknown;
      transformRequest: (url: string) => { url: string };
      maxBounds: unknown;
      pixelRatio: number;
    };
    expect(options.style).toBe("https://basemaps.cartocdn.com/gl/positron-gl-style/style.json");
    expect(options.pixelRatio).toBe(1);
    expect(options.maxBounds).toEqual([
      [-122.38, 47.58],
      [-122.25, 47.68],
    ]);
    expect(options.transformRequest(`${window.location.origin}/api/map/beacons`).url).toBe("about:blank");

    // Selecting a pin swaps the sheet for its card.
    await user.click(within(web().getByTestId("map-sheet")).getByRole("button", { name: /Campus Comedy Night/ }));
    expect(web().getByTestId("map-sheet")).toHaveTextContent("View");

    const constructed = mapMock.mock.calls.length;
    const instance = mapMock.mock.results[0]?.value as { remove: jest.Mock; setStyle: jest.Mock };
    const removed = instance.remove.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Toggle light or dark theme" }));
    expect(mapMock).toHaveBeenCalledTimes(constructed);
    expect(instance.remove).toHaveBeenCalledTimes(removed);
    expect(instance.setStyle).toHaveBeenCalledWith(
      "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      { diff: true },
    );
  });
});
