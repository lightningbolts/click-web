import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import EventLocationPicker from "@/components/events/EventLocationPicker";

jest.mock("@/components/maps/PinMap", () => ({ __esModule: true, default: () => <div data-testid="event-location-preview" /> }));

function Controlled({ initial = "" }: { initial?: string }) {
  const [name, setName] = useState(initial);
  const [coords, setCoords] = useState<[string, string]>(["", ""]);
  return (
    <EventLocationPicker
      locationName={name}
      lat={coords[0]}
      lng={coords[1]}
      onLocationNameChange={setName}
      onCoordsChange={(a, b) => setCoords([a, b])}
    />
  );
}

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("EventLocationPicker", () => {
  const onLocationNameChange = jest.fn();
  const onCoordsChange = jest.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    onLocationNameChange.mockReset();
    onCoordsChange.mockReset();
    Object.defineProperty(global.navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          success: PositionCallback,
          _error?: PositionErrorCallback,
          _options?: PositionOptions,
        ) => {
          success({
            coords: {
              latitude: 47.655,
              longitude: -122.305,
              accuracy: 1,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition);
        },
      },
    });
  });

  it("uses an intentional private-location label when reverse geocode fails", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      json: async () => ({ result: null }),
    });

    render(
      <EventLocationPicker
        locationName=""
        lat=""
        lng=""
        onLocationNameChange={onLocationNameChange}
        onCoordsChange={onCoordsChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Use my location" }));

    await waitFor(() => {
      expect(onCoordsChange).toHaveBeenCalledWith("47.655", "-122.305");
    });
    await waitFor(() => {
      expect(onLocationNameChange).toHaveBeenCalledWith("Location shared privately");
    });
    expect(onLocationNameChange).not.toHaveBeenCalledWith("Current location");
  });

  it("doesn't search for a saved name until the host types", async () => {
    render(<Controlled initial="The Quad" />);
    await new Promise((r) => setTimeout(r, 450));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("picks a result with the arrow keys and Enter", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      json: async () => ({ results: [{ label: "Pier 17", lat: 40.7, lng: -74 }, { label: "Pier 25", lat: 40.72, lng: -74.01 }] }),
    });
    render(<Controlled />);
    const input = screen.getByRole("combobox");
    await user.type(input, "pier");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", "event-location-option-1");
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("Pier 25");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(await screen.findByTestId("event-location-preview")).toBeInTheDocument();
  });
});
