/** A complete, valid marketing-intern application as multipart form data. */
export function pdfFile(name = 'Resume.pdf', bytes = '%PDF-1.7\n%test\n'): File {
  return new File([bytes], name, { type: 'application/pdf' });
}

export function applicationForm(overrides: Record<string, string | string[] | File | null> = {}): FormData {
  const fields: Record<string, string | string[] | File | null> = {
    position: 'marketing-intern',
    full_name: '  Dubs   Husky ',
    email: 'Dubs@UW.edu',
    school_year: 'junior',
    majors: 'Informatics',
    graduation_quarter: 'spring',
    graduation_year: String(new Date().getFullYear() + 2),
    weekly_hours: '5_10',
    start_date: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    interests: ['social_media', 'events_rso'],
    experience: '',
    links: 'instagram.com/dubs',
    pitch: 'I run the biggest RSO on campus and know every tabling spot.',
    tried_click: 'ios_beta',
    referral_source: 'friend',
    additional_info: '',
    resume: pdfFile(),
    ...overrides,
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === null) continue;
    if (Array.isArray(value)) value.forEach((v) => form.append(key, v));
    else form.append(key, value);
  }
  return form;
}
