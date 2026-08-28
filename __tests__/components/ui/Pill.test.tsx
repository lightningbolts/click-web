import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pill } from "@/components/ui/Pill";

describe("Pill", () => {
  it("renders selected and unselected styles", () => {
    const { rerender } = render(<Pill selected>Date</Pill>);
    expect(screen.getByRole("button", { name: "Date" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Date" })).toHaveClass("bg-primary");

    rerender(<Pill>Date</Pill>);
    expect(screen.getByRole("button", { name: "Date" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Date" })).toHaveClass("bg-transparent");
  });

  it("calls onClick when pressed", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<Pill onClick={onClick}>Going</Pill>);
    await user.click(screen.getByRole("button", { name: "Going" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
