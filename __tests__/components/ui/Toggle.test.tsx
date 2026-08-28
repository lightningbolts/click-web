import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "@/components/ui/Toggle";

describe("Toggle", () => {
  it("toggles via click and keyboard", async () => {
    const user = userEvent.setup();
    const onCheckedChange = jest.fn();
    render(
      <Toggle checked={false} onCheckedChange={onCheckedChange} aria-label="Approval required" />,
    );

    const control = screen.getByRole("switch", { name: "Approval required" });
    expect(control).toHaveAttribute("aria-checked", "false");

    await user.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    control.focus();
    await user.keyboard("{Space}");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("reflects checked state", () => {
    render(<Toggle checked onCheckedChange={() => {}} aria-label="Display my name" />);
    expect(screen.getByRole("switch", { name: "Display my name" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
