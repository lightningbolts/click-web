import { findRole } from '@/components/careers/roles';
import {
  cleanText,
  countWords,
  PITCH_MAX_WORDS,
  validateApplication,
  validateResume,
} from '@/lib/careers/application';
import { applicationForm } from '../../helpers/careersApplication';

const role = findRole('marketing-intern')!;
const now = new Date();

describe('validateApplication', () => {
  it('accepts a complete application and normalizes it', () => {
    const result = validateApplication(applicationForm(), role, now);
    expect(result).toMatchObject({
      ok: true,
      value: {
        full_name: 'Dubs Husky',
        email: 'dubs@uw.edu',
        interests: ['social_media', 'events_rso'],
        experience: null,
        additional_info: null,
      },
    });
  });

  it('reports every missing required answer', () => {
    const empty = new FormData();
    const result = validateApplication(empty, role, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(
      [
        'full_name',
        'email',
        'school_year',
        'majors',
        'graduation_quarter',
        'graduation_year',
        'weekly_hours',
        'start_date',
        'interests',
        'pitch',
        'tried_click',
        'referral_source',
      ].sort(),
    );
  });

  it.each(['dubs@gmail.com', 'dubs@uw.edu.evil.com', 'dubs@cs.uw.edu', 'not-an-email'])(
    'rejects non-UW email %s',
    (email) => {
      const result = validateApplication(applicationForm({ email }), role, now);
      expect(result.ok ? null : result.errors.email).toMatch(/@uw\.edu/);
    },
  );

  it('rejects values outside the allowed choices', () => {
    const result = validateApplication(
      applicationForm({ school_year: 'postdoc', weekly_hours: '40', interests: ['hacking'], tried_click: 'x' }),
      role,
      now,
    );
    expect(result.ok ? {} : result.errors).toMatchObject({
      school_year: expect.any(String),
      weekly_hours: expect.any(String),
      interests: expect.any(String),
      tried_click: expect.any(String),
    });
  });

  it(`limits the pitch to ${PITCH_MAX_WORDS} words`, () => {
    const atLimit = Array.from({ length: PITCH_MAX_WORDS }, () => 'go').join(' ');
    expect(validateApplication(applicationForm({ pitch: atLimit }), role, now).ok).toBe(true);
    const over = validateApplication(applicationForm({ pitch: `${atLimit} more` }), role, now);
    expect(over.ok ? null : over.errors.pitch).toMatch(/201/);
  });

  it('rejects start dates in the past and graduation years out of range', () => {
    const result = validateApplication(
      applicationForm({ start_date: '2020-01-01', graduation_year: '1999' }),
      role,
      now,
    );
    expect(result.ok ? {} : result.errors).toMatchObject({
      start_date: expect.any(String),
      graduation_year: expect.any(String),
    });
  });
});

describe('text helpers', () => {
  it('counts words across any whitespace', () => {
    expect(countWords('  one\ttwo\n\nthree ')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });

  it('strips control characters Postgres rejects', () => {
    expect(cleanText('a\u0000b\nc')).toBe('a b c');
    expect(cleanText(' line one\r\nline two\u0000 ', { multiline: true })).toBe('line one\nline two');
  });
});

describe('validateResume', () => {
  it('requires a PDF or Word file up to 10 MB', () => {
    expect(validateResume(null)).toMatch(/Attach/);
    expect(validateResume({ name: 'resume.png', size: 10 })).toMatch(/PDF or Word/);
    expect(validateResume({ name: 'resume.pdf', size: 0 })).toMatch(/empty/);
    expect(validateResume({ name: 'resume.pdf', size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/);
    expect(validateResume({ name: 'Resume.DOCX', size: 2048 })).toBeNull();
  });
});
