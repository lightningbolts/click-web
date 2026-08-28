import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventCreateForm from "@/components/events/EventCreateForm";
import { UPLOAD_FALLBACK_ERROR } from "@/lib/uploads/constants";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/auth/freshAuthHeaders", () => ({
  getFreshAuthHeaders: async () => ({ "Content-Type": "application/json" }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("EventCreateForm", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("posts event beacon fields including title and schedule", async () => {
    const user = userEvent.setup();
    render(<EventCreateForm />);
    expect(screen.getByTestId("event-create-form")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Event name")).toBeInTheDocument();
    expect(screen.getByText("Create event")).toBeInTheDocument();
    expect(screen.getByText("Event options")).toBeInTheDocument();
    await user.click(screen.getByText("Event options"));
    expect(screen.getByText("Visibility & Access")).toBeInTheDocument();
    const form = screen.getByTestId("event-create-form");
    expect(form.querySelector('[name="title"]')).not.toBeNull();
    expect(form.querySelector('[name="event_start_at"]')).not.toBeNull();
    expect(form.querySelector('[name="event_end_at"]')).not.toBeNull();
    expect(form.querySelector('[name="lat"]')).not.toBeNull();
    expect(form.querySelector('[name="lng"]')).not.toBeNull();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows cover upload errors under the dropzone", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Storage upload failed" }),
    });

    render(<EventCreateForm />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array(1200)], "cover.jpg", { type: "image/jpeg" });
    await user.upload(input, file);

    expect(await screen.findByRole("alert")).toHaveTextContent(UPLOAD_FALLBACK_ERROR);
  });
});
