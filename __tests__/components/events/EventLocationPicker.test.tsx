import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventLocationPicker from "@/components/events/EventLocationPicker";

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
});
