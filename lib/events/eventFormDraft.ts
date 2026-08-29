import type { EventVisibility, GuestListVisibility } from "@/lib/events/eventOptions";

export type EventVenueScale = "intimate" | "neighborhood" | "venue" | "campus";

/** Serializable create/edit form values (ISO timestamps, string coords). */
export type EventFormDraft = {
  title: string;
  description: string;
  startIso: string;
  endIso: string;
  timeZone: string;
  locationName: string;
  lat: string;
  lng: string;
  imageUrl: string | null;
  coverThemeId: string;
  visibility: EventVisibility;
  capacity: number | null;
  approvalRequired: boolean;
  guestListVisibility: GuestListVisibility;
  showCreatorName: boolean;
  venueScale: EventVenueScale;
  categories: string[];
};
