import { render, screen } from "@testing-library/react";
import ConnectionTable from "@/components/dashboard/ConnectionTable";
import type { ConnectionRecord } from "@/components/dashboard/ConnectionTable";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";

jest.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    onlineUserIds: new Set(),
  }),
}));

jest.mock("framer-motion", () => {
  const React = require("react");
  const Forward = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement(tag, { ...props, ref }),
    );
  return {
    motion: new Proxy({}, { get: (_t: unknown, prop: string) => Forward(prop) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

const longLocation = "1761 208th Place Southeast • Sammamish, Washington";

const row: ConnectionRecord = {
  id: "c1",
  otherUserId: "peer-1",
  name: "Matthew Epshtein",
  dateMet: new Date("2026-08-01T12:00:00Z"),
  location: longLocation,
  status: "active",
  context: "at_event",
  noiseSummary: "Very quiet · 31 dB",
};

function renderTable() {
  return render(
    <ThemeProvider>
      <ConnectionTable connections={[row]} />
    </ThemeProvider>,
  );
}

describe("ConnectionTable", () => {
  it("truncates long locations instead of wrapping the row", () => {
    renderTable();
    const cells = screen.getAllByTitle(longLocation);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.some((el) => el.className.includes("truncate"))).toBe(true);
    expect(screen.getByTestId("connection-row").querySelector("td.whitespace-nowrap")).toBeTruthy();
  });
});
