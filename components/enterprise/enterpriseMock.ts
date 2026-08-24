export const HUB_CENTER = { lat: 47.6554, lng: -122.305 };

export const DEMO_ROOMS = [
  { id: "lounge", label: "Ground-floor lounge", lat: 47.6555, lng: -122.3052, tone: "primary" as const },
  { id: "ballroom", label: "Ballroom", lat: 47.6552, lng: -122.3047, tone: "secondary" as const },
  { id: "cafe", label: "Husky Den", lat: 47.6557, lng: -122.3055, tone: "primary" as const },
];

export const DEMO_EVENTS = [
  { id: "e1", title: "Club fair", when: "Tonight · 6:00 PM", room: "Ballroom", going: 186 },
  { id: "e2", title: "Study night", when: "Tonight · 8:30 PM", room: "Lounge", going: 42 },
  { id: "e3", title: "Open mic", when: "Tomorrow · 7:00 PM", room: "Husky Den", going: 67 },
];

export const DEMO_PULSE = [
  { id: "p1", text: "12 people met in the lounge in the last hour." },
  { id: "p2", text: "Club fair check-ins are ahead of last month's fair." },
  { id: "p3", text: "The ballroom is busy; the cafe is quiet." },
];
