import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EnterprisePlayground from "@/components/enterprise/EnterprisePlayground";

jest.mock("next/dynamic", () => () => {
  const Mock = () => <div data-testid="pin-map" />;
  Mock.displayName = "PinMapMock";
  return Mock;
});

jest.mock("framer-motion", () => {
  const React = require("react");
  const Forward = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement(tag, { ...props, ref }),
    );
  return {
    motion: new Proxy({}, { get: (_target: unknown, prop: string) => Forward(prop) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => true,
  };
});

describe("EnterprisePlayground", () => {
  it("walks venue scenes without invented metric jargon", async () => {
    const user = userEvent.setup();
    render(<EnterprisePlayground />);
    expect(screen.getByTestId("enterprise-playground")).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();
    expect(screen.queryByText(/Connection Velocity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Social Sticky Score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tri-Factor Handshake/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Events" }));
    expect(screen.getByText("Club fair")).toBeInTheDocument();
  });
});
