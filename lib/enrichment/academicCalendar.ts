import type { AcademicEra } from '@/lib/enrichment/vibeCaptureSchema';

const DEG = Math.PI / 180;

/** UW main campus centroid — within ~8 km uses UW calendar */
const UW_CAMPUS = { lat: 47.6553, lon: -122.3035 };
const UW_RADIUS_KM = 8;

type TermWindow = {
  id: string;
  title: string;
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
  finalsStart: string;
};

type BreakWindow = {
  era: AcademicEra;
  start: string;
  end: string;
};

/** Enterprise UW academic timeline (extend annually). */
const UW_TERMS: TermWindow[] = [
  {
    id: 'uw-autumn-2025',
    title: 'UW Autumn Quarter 2025',
    start: '2025-09-24',
    end: '2025-12-12',
    finalsStart: '2025-12-06',
  },
  {
    id: 'uw-winter-2026',
    title: 'UW Winter Quarter 2026',
    start: '2026-01-05',
    end: '2026-03-13',
    finalsStart: '2026-03-07',
  },
  {
    id: 'uw-spring-2026',
    title: 'UW Spring Quarter 2026',
    start: '2026-03-30',
    end: '2026-06-05',
    finalsStart: '2026-05-30',
  },
  {
    id: 'uw-summer-2026',
    title: 'UW Summer Quarter 2026',
    start: '2026-06-22',
    end: '2026-08-21',
    finalsStart: '2026-08-15',
  },
  {
    id: 'uw-autumn-2026',
    title: 'UW Autumn Quarter 2026',
    start: '2026-09-23',
    end: '2026-12-11',
    finalsStart: '2026-12-05',
  },
  {
    id: 'uw-winter-2027',
    title: 'UW Winter Quarter 2027',
    start: '2027-01-04',
    end: '2027-03-12',
    finalsStart: '2027-03-06',
  },
];

const UW_BREAKS: BreakWindow[] = [
  { era: 'Winter Break', start: '2025-12-13', end: '2026-01-04' },
  { era: 'Spring Break', start: '2026-03-14', end: '2026-03-29' },
  { era: 'Summer Break', start: '2026-06-06', end: '2026-06-21' },
  { era: 'Winter Break', start: '2026-12-12', end: '2027-01-03' },
];

/** Generic quarter template when not near a mapped campus */
const GENERIC_TERMS: TermWindow[] = [
  {
    id: 'generic-spring-2026',
    title: 'Spring Term 2026',
    start: '2026-01-10',
    end: '2026-05-15',
    finalsStart: '2026-05-09',
  },
  {
    id: 'generic-fall-2026',
    title: 'Fall Term 2026',
    start: '2026-08-20',
    end: '2026-12-15',
    finalsStart: '2026-12-09',
  },
];

const GENERIC_BREAKS: BreakWindow[] = [
  { era: 'Summer Break', start: '2026-05-16', end: '2026-08-19' },
  { era: 'Winter Break', start: '2025-12-16', end: '2026-01-09' },
];

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function daysBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isNearUwCampus(lat: number, lon: number): boolean {
  return haversineKm(lat, lon, UW_CAMPUS.lat, UW_CAMPUS.lon) <= UW_RADIUS_KM;
}

function findBreak(
  date: Date,
  breaks: BreakWindow[],
): AcademicEra | null {
  for (const b of breaks) {
    const start = parseYmd(b.start);
    const end = parseYmd(b.end);
    if (date >= start && date <= end) return b.era;
  }
  return null;
}

function findTerm(date: Date, terms: TermWindow[]): TermWindow | null {
  for (const t of terms) {
    const start = parseYmd(t.start);
    const end = parseYmd(t.end);
    if (date >= start && date <= end) return t;
  }
  return null;
}

function eraWithinTerm(date: Date, term: TermWindow): AcademicEra {
  const start = parseYmd(term.start);
  const finalsStart = parseYmd(term.finalsStart);
  const end = parseYmd(term.end);

  if (date >= finalsStart && date <= end) return 'Finals Week';

  const dayIndex = daysBetween(start, date);
  const weekIndex = Math.floor(dayIndex / 7) + 1;

  if (weekIndex === 1) return 'Syllabus Week';
  if (weekIndex >= 4 && weekIndex <= 6) return 'Midterms Grind';
  return 'In Session';
}

export type AcademicProfile = {
  academic_era: AcademicEra;
  academic_term: string;
};

/**
 * Resolves academic term title and era from local calendar date + coordinates.
 */
export function profileAcademicCalendar(
  localDateYmd: string,
  lat: number,
  lon: number,
): AcademicProfile {
  const date = parseYmd(localDateYmd);
  const nearUw = isNearUwCampus(lat, lon);
  const breaks = nearUw ? UW_BREAKS : GENERIC_BREAKS;
  const terms = nearUw ? UW_TERMS : GENERIC_TERMS;

  const breakEra = findBreak(date, breaks);
  if (breakEra) {
    return {
      academic_era: breakEra,
      academic_term: nearUw ? 'UW — Break Period' : 'Academic Break',
    };
  }

  const term = findTerm(date, terms);
  if (!term) {
    return {
      academic_era: 'Outside Academic Calendar',
      academic_term: nearUw ? 'UW — Off Term' : 'Outside Term',
    };
  }

  return {
    academic_era: eraWithinTerm(date, term),
    academic_term: term.title,
  };
}

/** YYYY-MM-DD in local offset applied to UTC instant */
export function localCalendarYmd(utcIso: string, lon: number): string | null {
  const utc = new Date(utcIso);
  if (Number.isNaN(utc.getTime())) return null;
  const offsetHours = Math.round((lon / 15) * 2) / 2;
  const local = new Date(utc.getTime() + offsetHours * 3600000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
