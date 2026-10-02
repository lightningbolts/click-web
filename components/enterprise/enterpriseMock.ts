export const HUB_CENTER = { lat: 47.6554, lng: -122.305 };

export const DEMO_ROOMS = [
  { id: "lounge", label: "Ground-floor lounge", lat: 47.6555, lng: -122.3052, tone: "primary" as const },
  { id: "ballroom", label: "Ballroom", lat: 47.6552, lng: -122.3047, tone: "secondary" as const },
  { id: "cafe", label: "Husky Den", lat: 47.6557, lng: -122.3055, tone: "primary" as const },
];

export const DEMO_EVENTS = [
  {
    id: "e1",
    title: "Club fair",
    when: "Tonight · 6:00 PM",
    room: "Ballroom",
    going: 186,
    checkedIn: 142,
    met: 41,
    groups: 9,
    host: "SAO",
  },
  {
    id: "e2",
    title: "Study night",
    when: "Tonight · 8:30 PM",
    room: "Lounge",
    going: 42,
    checkedIn: 35,
    met: 9,
    groups: 2,
    host: "Odegaard",
  },
  {
    id: "e3",
    title: "Open mic",
    when: "Tomorrow · 7:00 PM",
    upcoming: true,
    room: "Husky Den",
    going: 67,
    checkedIn: 0,
    met: 0,
    groups: 0,
    host: "HUB Programs",
  },
];
