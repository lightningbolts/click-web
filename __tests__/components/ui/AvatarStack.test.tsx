import { render, screen } from "@testing-library/react";
import { AvatarStack } from "@/components/ui/AvatarStack";

describe("AvatarStack", () => {
  it("shows avatars, overflow, and label", () => {
    render(
      <AvatarStack
        items={[
          { id: "1", label: "Alex" },
          { id: "2", label: "Blake" },
          { id: "3", label: "Casey" },
        ]}
        count={12}
        label="12 going"
        maxVisible={2}
      />,
    );

    expect(screen.getByText("12 going")).toBeInTheDocument();
    expect(screen.getByText("+10")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("renders as a button when onClick is provided", async () => {
    const onClick = jest.fn();
    render(
      <AvatarStack
        items={[{ label: "Jordan" }]}
        label="1 going"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole("button", { name: /1 going/i });
    await button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
