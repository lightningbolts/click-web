import { DEFAULT_ROLE, listQuery, parseListParams } from '@/lib/careers/recruiting';

describe('parseListParams', () => {
  it('defaults to the newest applications for the default role', () => {
    expect(parseListParams({})).toEqual({
      role: DEFAULT_ROLE,
      q: '',
      status: '',
      year: '',
      interest: '',
      hours: '',
      sort: 'newest',
      page: 1,
    });
  });

  it('keeps known filters and drops unknown values', () => {
    const params = parseListParams({
      status: 'shortlisted',
      year: 'senior',
      hours: '15_plus',
      interest: 'social_media',
      sort: 'name',
      page: '3',
    });
    expect(params).toMatchObject({ status: 'shortlisted', year: 'senior', hours: '15_plus', interest: 'social_media', sort: 'name', page: 3 });

    expect(parseListParams({ status: 'hired', year: 'phd', hours: '40', sort: 'random', page: '-2', role: '../x' })).toMatchObject({
      role: DEFAULT_ROLE,
      status: '',
      year: '',
      hours: '',
      sort: 'newest',
      page: 1,
    });
  });

  it('strips characters that could alter the PostgREST search filter', () => {
    expect(parseListParams({ q: 'o\'brien,status.eq.new)*"%_' }).q).toBe("o'brienstatus.eq.new");
    expect(parseListParams({ q: '  Zoë  ' }).q).toBe('Zoë');
    expect(parseListParams({ q: 'a'.repeat(300) }).q).toHaveLength(100);
  });

  it('takes the first value when a parameter repeats', () => {
    expect(parseListParams({ status: ['accepted', 'rejected'] }).status).toBe('accepted');
  });
});

describe('listQuery', () => {
  it('omits defaults so the plain list has a clean URL', () => {
    expect(listQuery(parseListParams({}))).toBe('');
  });

  it('round-trips through parseListParams', () => {
    const params = parseListParams({ q: 'dubs', status: 'interview', sort: 'oldest', page: '2' });
    const query = listQuery(params);
    expect(query).toBe('?q=dubs&status=interview&sort=oldest&page=2');
    expect(parseListParams(Object.fromEntries(new URLSearchParams(query)))).toEqual(params);
  });

  it('applies a patch without changing the original', () => {
    const params = parseListParams({ status: 'new', page: '4' });
    expect(listQuery(params, { status: '', page: 1 })).toBe('');
    expect(params.page).toBe(4);
  });
});
