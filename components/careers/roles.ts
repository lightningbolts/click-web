/**
 * Open roles shown on /careers. Add a role here to list it and open its application at
 * /careers/[id]; remove it when it closes. `id` is also the `position` stored on each
 * application, and `interests` are the role's "Areas of interest" choices.
 */
export type CareerRole = {
  id: string;
  title: string;
  team: string;
  location: string;
  type: string;
  summary: string;
  responsibilities: string[];
  lookingFor: string[];
  /** The application's "What could you bring…" prompt. */
  pitchPrompt: string;
  interests: readonly { value: string; label: string }[];
};

export const OPEN_ROLES: CareerRole[] = [
  {
    id: "marketing-intern",
    title: "Marketing Intern",
    team: "Growth",
    location: "Seattle, on campus at UW",
    type: "Internship, part time",
    summary:
      "Help more people find Click and keep in touch with the people they actually meet. You will work directly with the founding team on how Click shows up on campus and online.",
    responsibilities: [
      "Make short-form content for Instagram and TikTok (optional)",
      "Bring student organizations onto Click for their events",
      "Track what brings people in and share what you learn with the team",
    ],
    lookingFor: [
      "Any major, any year",
      "You know what students on your campus care about",
      "You are comfortable starting conversations with people you just met",
      "Bonus: you already make content or run a club",
    ],
    pitchPrompt: "What could you bring to Click as a marketing intern?",
    interests: [
      { value: "social_media", label: "Social media & content creation" },
      { value: "campus_outreach", label: "Campus outreach & tabling" },
      { value: "events_rso", label: "Events & RSO partnerships" },
      { value: "growth_analytics", label: "Growth strategy & analytics" },
      { value: "design_branding", label: "Graphic design & branding" },
      { value: "other", label: "Other" },
    ],
  },
];

export function findRole(id: string): CareerRole | undefined {
  return OPEN_ROLES.find((role) => role.id === id);
}
