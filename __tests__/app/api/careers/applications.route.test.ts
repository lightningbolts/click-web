/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/careers/applications/route';
import { applicationForm, pdfFile } from '../../../helpers/careersApplication';

const mockLookup = jest.fn();
const mockInsert = jest.fn();
const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockRateLimited = jest.fn();

const lookupChain = {
  select: () => lookupChain,
  eq: () => lookupChain,
  maybeSingle: () => mockLookup(),
};

jest.mock('@/lib/server/connectionWriteAuth', () => ({
  createAdminClient: () => ({
    from: () => ({ ...lookupChain, insert: mockInsert }),
    storage: { from: () => ({ upload: mockUpload, remove: mockRemove }) },
  }),
}));

jest.mock('@/lib/server/rateLimit', () => ({
  ...jest.requireActual('@/lib/server/rateLimit'),
  isRateLimited: () => mockRateLimited(),
}));

function request(form: FormData, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/careers/applications', {
    method: 'POST',
    body: form,
    headers: { 'cf-connecting-ip': '203.0.113.7', ...headers },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRateLimited.mockResolvedValue(false);
  mockLookup.mockResolvedValue({ data: null, error: null });
  mockUpload.mockResolvedValue({ data: { path: 'x' }, error: null });
  mockInsert.mockResolvedValue({ error: null });
  mockRemove.mockResolvedValue({ error: null });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/careers/applications', () => {
  it('stores the resume privately under a server-chosen name, then the application', async () => {
    const response = await POST(request(applicationForm({ resume: pdfFile('../../etc/My Résumé.pdf') })));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });

    const [path, , options] = mockUpload.mock.calls[0];
    expect(path).toMatch(/^marketing-intern\/[0-9a-f-]{36}\.pdf$/);
    expect(options).toMatchObject({ contentType: 'application/pdf', upsert: false });

    const row = mockInsert.mock.calls[0][0];
    expect(row).toMatchObject({
      position: 'marketing-intern',
      full_name: 'Dubs Husky',
      email: 'dubs@uw.edu',
      interests: ['social_media', 'events_rso'],
      resume_path: path,
      resume_name: 'My Résumé.pdf',
      resume_type: 'application/pdf',
    });
    expect(row.id).toBe(path.slice('marketing-intern/'.length, -'.pdf'.length));
    expect(row).not.toHaveProperty('status');
    expect(row).not.toHaveProperty('notes');
  });

  it('returns field errors without touching storage', async () => {
    const response = await POST(request(applicationForm({ email: 'dubs@gmail.com', resume: null })));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('validation_error');
    expect(Object.keys(body.fields).sort()).toEqual(['email', 'resume']);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it.each([
    ['a renamed image', new File(['\x89PNG\r\n'], 'resume.pdf', { type: 'application/pdf' })],
    ['an unsupported type', new File(['hello'], 'resume.txt', { type: 'text/plain' })],
    ['an oversized file', new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' })],
  ])('rejects %s', async (_label, file) => {
    const response = await POST(request(applicationForm({ resume: file })));
    expect(response.status).toBe(400);
    expect((await response.json()).fields.resume).toEqual(expect.any(String));
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('rejects a declared body over the limit before reading it', async () => {
    const response = await POST(request(applicationForm(), { 'content-length': String(11 * 1024 * 1024) }));
    expect(response.status).toBe(413);
    expect(mockRateLimited).not.toHaveBeenCalled();
  });

  it('rate limits by IP', async () => {
    mockRateLimited.mockResolvedValue(true);
    const response = await POST(request(applicationForm()));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('quietly drops honeypot submissions', async () => {
    const response = await POST(request(applicationForm({ website: 'https://spam.example' })));
    expect(response.status).toBe(201);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects closed or unknown roles', async () => {
    const response = await POST(request(applicationForm({ position: 'ceo' })));
    expect(response.status).toBe(404);
  });

  it('answers a repeat applicant without uploading again', async () => {
    mockLookup.mockResolvedValue({ data: { id: 'existing' }, error: null });
    const response = await POST(request(applicationForm()));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('already_applied');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('removes the upload when a racing duplicate wins the insert', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });
    const response = await POST(request(applicationForm()));
    expect(response.status).toBe(409);
    expect(mockRemove).toHaveBeenCalledWith([mockUpload.mock.calls[0][0]]);
  });

  it('removes the upload and reports a generic error when the insert fails', async () => {
    mockInsert.mockResolvedValue({ error: { code: '500', message: 'db down' } });
    const response = await POST(request(applicationForm()));
    expect(response.status).toBe(500);
    expect((await response.json()).error).not.toMatch(/db down/);
    expect(mockRemove).toHaveBeenCalled();
  });

  it('reports a failed upload without inserting', async () => {
    mockUpload.mockResolvedValue({ data: null, error: { message: 'bucket offline' } });
    const response = await POST(request(applicationForm()));
    expect(response.status).toBe(502);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
