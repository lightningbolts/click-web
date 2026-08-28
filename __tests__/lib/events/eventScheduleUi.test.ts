import {
  eventClock12hFrom24h,
  eventClock12hTo24h,
  coerceSameDayEventTimes,
  formatEventClockLabel,
} from "@/lib/events/eventScheduleUi";

describe("eventScheduleUi", () => {
  it("round-trips 12h and 24h clocks", () => {
    expect(eventClock12hFrom24h(0, 5)).toEqual({ hour12: 12, minute: 5, isPm: false });
    expect(eventClock12hFrom24h(15, 30)).toEqual({ hour12: 3, minute: 30, isPm: true });
    expect(eventClock12hTo24h({ hour12: 12, minute: 0, isPm: false })).toEqual({ hour: 0, minute: 0 });
    expect(eventClock12hTo24h({ hour12: 12, minute: 15, isPm: true })).toEqual({ hour: 12, minute: 15 });
    expect(formatEventClockLabel(18, 5)).toBe("6:05 PM");
  });

  it("keeps end after start on the same day", () => {
    expect(coerceSameDayEventTimes(false, 10, 0, 9, 0)).toEqual({
      start: { hour: 10, minute: 0 },
      end: { hour: 10, minute: 1 },
    });
  });
});
