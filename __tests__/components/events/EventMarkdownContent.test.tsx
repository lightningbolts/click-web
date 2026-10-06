import { render, screen } from "@testing-library/react";
import EventMarkdownContent from "@/components/events/EventMarkdownContent";

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
