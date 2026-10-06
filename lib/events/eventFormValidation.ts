import {
  parseEventRecurrenceFromBody,
  validateEventRecurrence,
  type EventRecurrence,
  type EventRecurrenceFrequency,
} from "@/lib/events/eventRecurrence";
import { instantFromWallClock, type WallClock } from "@/lib/events/zonedTime";

/** Field ids double as DOM ids so a failed submit can focus the first error (spec §7.6.3). */
export const EVENT_FORM_FIELDS = ["event-title", "event-start", "event-end", "event-location", "event-capacity", "event-repeat-count"] as const;
export type EventFormField = (typeof EVENT_FORM_FIELDS)[number];
export type EventFormErrors = Partial<Record<EventFormField, string>>;

export type EventFormValues = {
  title: string;
  start: WallClock;
  end: WallClock;
  timeZone: string;
  locationName: string;
  lat: string;
  lng: string;
  capacityText: string;
  repeat: { frequency: EventRecurrenceFrequency; count: string } | null;
};

export type ValidatedEventForm = {
  errors: EventFormErrors;
  startAt: Date | null;
  endAt: Date | null;
  capacity: number | null;
  recurrence: EventRecurrence | null;
};

export function validateEventForm(v: EventFormValues): ValidatedEventForm {
  const errors: EventFormErrors = {};
  if (!v.title.trim()) errors["event-title"] = "Give your event a name.";

  const startAt = instantFromWallClock(v.start, v.timeZone);
  const endAt = instantFromWallClock(v.end, v.timeZone);
  if (!startAt) errors["event-start"] = "Pick a start date and time.";
  if (!endAt) errors["event-end"] = "Pick an end date and time.";
  else if (startAt && endAt.getTime() <= startAt.getTime()) errors["event-end"] = "End must be after the start.";

  const latN = Number(v.lat);
  const lngN = Number(v.lng);
  if (!v.locationName.trim()) errors["event-location"] = "Add a location so guests know where to go.";
  else if (v.lat === "" || v.lng === "" || !Number.isFinite(latN) || !Number.isFinite(lngN))
    errors["event-location"] = "Pick a result or use your location so the event has a map pin.";

  let capacity: number | null = null;
  if (v.capacityText.trim()) {
    const n = Number(v.capacityText);
    if (!Number.isInteger(n) || n < 1) errors["event-capacity"] = "Capacity is a whole number of 1 or more.";
    else capacity = n;
  }

  let recurrence: EventRecurrence | null = null;
  if (v.repeat) {
    const parsed = parseEventRecurrenceFromBody({ recurrence: v.repeat });
    if ("error" in parsed) errors["event-repeat-count"] = parsed.error.replace("recurrence.count", "Number of events");
    else {
      recurrence = parsed.recurrence;
      if (startAt && endAt && !errors["event-end"]) {
        const err = validateEventRecurrence({ startEpochMs: startAt.getTime(), endEpochMs: endAt.getTime() }, recurrence);
        if (err) errors["event-repeat-count"] = err;
      }
    }
  }

  return { errors, startAt, endAt, capacity, recurrence };
}

export function firstErrorField(errors: EventFormErrors): EventFormField | null {
  return EVENT_FORM_FIELDS.find((f) => errors[f]) ?? null;
}
