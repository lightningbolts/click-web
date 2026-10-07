import { render, screen } from "@testing-library/react";
import EventMarkdownContent, { EventMarkdownPreview } from "@/components/events/EventMarkdownContent";

describe("EventMarkdownContent", () => {
  it("renders a list that follows a line in the same paragraph", () => {
    render(<EventMarkdownContent>{"**What to bring**\n- Something warm\n- A friend\nDoors at 7."}</EventMarkdownContent>);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Something warm", "A friend"]);
    expect(screen.getByText("What to bring").tagName).toBe("STRONG");
    expect(screen.getByText("Doors at 7.")).toBeInTheDocument();
  });

  it("keeps numbered lists and their markers", () => {
    render(<EventMarkdownContent>{"Agenda\n3. Talks\n4. Drinks"}</EventMarkdownContent>);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveAttribute("value", "3");
    expect(screen.getByRole("list").tagName).toBe("OL");
  });

  it("renders nothing for blank input", () => {
    const { container } = render(<EventMarkdownContent>{"  \n "}</EventMarkdownContent>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("EventMarkdownPreview", () => {
  it("flattens blocks, keeps inline formatting and drops a heading that repeats the title", () => {
    const { container } = render(
      <EventMarkdownPreview title="Run Club">
        {"# Run Club\nJoin us for **Run Club**, a casual run on the *Burke-Gilman*.\n\n- Bring water\n- [RSVP](https://x.co)"}
      </EventMarkdownPreview>,
    );
    expect(container.textContent).toBe("Join us for Run Club, a casual run on the Burke-Gilman. Bring water RSVP");
    expect(container.querySelector("strong")?.textContent).toBe("Run Club");
    expect(container.querySelector("em")?.textContent).toBe("Burke-Gilman");
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).not.toMatch(/[#*]/);
  });

  it("keeps a heading that isn't the title, as plain text", () => {
    const { container } = render(<EventMarkdownPreview title="Run Club">{"## What to bring\nWater"}</EventMarkdownPreview>);
    expect(container.textContent).toBe("What to bring Water");
  });
});
