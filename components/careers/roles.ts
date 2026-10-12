/**
 * Open roles shown on /careers. Add a role here to list it; remove it when it closes.
 * `applyUrl` is the public Google Form link (the /viewform URL, not /edit).
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
  applyUrl: string;
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
    applyUrl:
      "https://docs.google.com/forms/d/1ns06Hl-sHS7XMpAljoe5IFAkwt0POw5BfMkznRlu2ks/viewform",
  },
];
