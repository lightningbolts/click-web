import { firstErrorField, validateEventForm, type EventFormValues } from "@/lib/events/eventFormValidation";

const base: EventFormValues = {
  title: "Picnic",
  start: { date: "2030-06-15", time: "18:00" },
  end: { date: "2030-06-15", time: "21:00" },
  timeZone: "America/New_York",
  locationName: "The Quad",
  lat: "47.6",
  lng: "-122.3",
  capacityText: "",
  repeat: null,
};

describe("validateEventForm", () => {
  it("accepts a complete form and converts times in the event zone", () => {
    const r = validateEventForm(base);
    expect(r.errors).toEqual({});
    expect(r.startAt?.toISOString()).toBe("2030-06-15T22:00:00.000Z");
    expect(r.capacity).toBeNull();
  });

  it("reports each problem against its field, in form order", () => {
    const r = validateEventForm({
      ...base,
      title: " ",
      end: { date: "2030-06-15", time: "17:00" },
      lat: "",
      capacityText: "2.5",
    });
    expect(Object.keys(r.errors)).toEqual(["event-title", "event-end", "event-location", "event-capacity"]);
    expect(firstErrorField(r.errors)).toBe("event-title");
  });

  it("parses capacity", () => {
    expect(validateEventForm({ ...base, capacityText: "40" }).capacity).toBe(40);
  });

  it("validates repeat counts", () => {
    expect(validateEventForm({ ...base, repeat: { frequency: "weekly", count: "4" } }).recurrence).toEqual({
      frequency: "weekly",
      count: 4,
    });
    expect(validateEventForm({ ...base, repeat: { frequency: "weekly", count: "99" } }).errors["event-repeat-count"]).toBeTruthy();
  });
});
