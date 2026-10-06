import { act, fireEvent, render, screen } from "@testing-library/react";
import { EventRecapViewer, RECAP_SLIDE_MS, type RecapDrop } from "@/components/events/EventRecapViewer";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const postHomeAction = jest.fn().mockResolvedValue({ drops: [] });
jest.mock("@/lib/home/postHomeAction", () => ({ postHomeAction: (...a: unknown[]) => postHomeAction(...a) }));

const drop = (id: string, name: string, mine = false): RecapDrop => ({
  id,
  user: { id: `u-${id}`, name, avatar_url: null },
  is_mine: mine,
  width: 300,
  height: 400,
  preview_url: `https://img/${id}-p.jpg`,
  original_url: `https://img/${id}.jpg`,
});
const drops = [drop("d1", "Ada"), drop("d2", "Me", true), drop("d3", "Sam")];
const people = [{ user_id: "p1", name: "Grace", avatar_url: null, connection_id: "c1" }];

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

const current = () => screen.getByRole("img").getAttribute("alt");

describe("EventRecapViewer (spec §7.6.5)", () => {
  it("advances every 4 s and stops on the people slide", () => {
    render(<EventRecapViewer title="Launch" drops={drops} people={people} closeHref="/e/b1" />);
    expect(current()).toBe("Drop by Ada");
    act(() => jest.advanceTimersByTime(RECAP_SLIDE_MS));
    expect(current()).toBe("Your drop");
    act(() => jest.advanceTimersByTime(RECAP_SLIDE_MS));
    act(() => jest.advanceTimersByTime(RECAP_SLIDE_MS));
    expect(screen.getByText("You Clicked with 1 person here")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Grace/ })).toHaveAttribute("href", "/clicks/c/c1");
    act(() => jest.advanceTimersByTime(RECAP_SLIDE_MS));
    act(() => jest.advanceTimersByTime(RECAP_SLIDE_MS));
    expect(screen.getByTestId("recap-people")).toBeInTheDocument();
  });

  it("steps with arrow keys, pauses with Space and closes with Escape", () => {
    render(<EventRecapViewer title="Launch" drops={drops} people={[]} closeHref="/e/b1" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(current()).toBe("Your drop");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(current()).toBe("Drop by Ada");
    fireEvent.keyDown(window, { key: " " });
    act(() => jest.advanceTimersByTime(RECAP_SLIDE_MS));
    act(() => jest.advanceTimersByTime(RECAP_SLIDE_MS));
    expect(current()).toBe("Drop by Ada");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(push).toHaveBeenCalledWith("/e/b1");
  });

  it("goes back on the left third and forward elsewhere", () => {
    render(<EventRecapViewer title="Launch" drops={drops} people={[]} closeHref="/e/b1" />);
    const zone = screen.getByTestId("recap-tap-zone");
    jest.spyOn(zone, "getBoundingClientRect").mockReturnValue({ left: 0, width: 300 } as DOMRect);
    fireEvent.click(zone, { clientX: 250 });
    expect(current()).toBe("Your drop");
    fireEvent.click(zone, { clientX: 50 });
    expect(current()).toBe("Drop by Ada");
  });

  it("records develops for other people's drops only", () => {
    render(<EventRecapViewer title="Launch" drops={drops} people={[]} closeHref="/e/b1" />);
    expect(postHomeAction).toHaveBeenCalledWith("/api/drops/develop", {
      drops: [
        { kind: "event", id: "d1" },
        { kind: "event", id: "d3" },
      ],
    });
  });
});
