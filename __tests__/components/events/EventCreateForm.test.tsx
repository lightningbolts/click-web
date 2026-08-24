import { render, screen } from "@testing-library/react";
import EventCreateForm from "@/components/events/EventCreateForm";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/auth/freshAuthHeaders", () => ({
  getFreshAuthHeaders: async () => ({ "Content-Type": "application/json" }),
}));

describe("EventCreateForm", () => {
  it("posts event beacon fields including title and schedule", () => {
    render(<EventCreateForm />);
    expect(screen.getByTestId("event-create-form")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Community picnic")).toBeInTheDocument();
    expect(screen.getByText("Create event")).toBeInTheDocument();
    const form = screen.getByTestId("event-create-form");
    expect(form.querySelector('[name="title"]')).not.toBeNull();
    expect(form.querySelector('[name="event_start_at"]')).not.toBeNull();
    expect(form.querySelector('[name="event_end_at"]')).not.toBeNull();
    expect(form.querySelector('[name="lat"]')).not.toBeNull();
    expect(form.querySelector('[name="lng"]')).not.toBeNull();
  });
});
