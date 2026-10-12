/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET } from '@/app/(admin)/admin/recruiting/[applicationId]/resume/route';

const ID = '932067f1-765d-43a1-b5e2-c73fa754dab3';
const mockRequireAdmin = jest.fn();
const mockRow = jest.fn();
const mockSign = jest.fn();

jest.mock('@/lib/server/careers', () => ({
  ...jest.requireActual('@/lib/server/careers'),
  requireRecruitingAdmin: () => mockRequireAdmin(),
}));

const rowChain = { select: () => rowChain, eq: () => rowChain, maybeSingle: () => mockRow() };
const supabase = { from: () => rowChain, storage: { from: () => ({ createSignedUrl: mockSign }) } };

function get(id: string, query = '') {
  return GET(new NextRequest(`http://localhost/admin/recruiting/${id}/resume${query}`), { params: Promise.resolve({ applicationId: id }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ ok: true, supabase, user: { id: 'admin' } });
  mockRow.mockResolvedValue({ data: { resume_path: `marketing-intern/${ID}.pdf`, resume_name: 'Dubs Resume.pdf' } });
  mockSign.mockResolvedValue({ data: { signedUrl: 'https://project.supabase.co/storage/v1/object/sign/x?token=t' }, error: null });
});

it('redirects admins to a one-minute signed URL that is never cached', async () => {
  const res = await get(ID);
  expect(res.status).toBe(303);
  expect(res.headers.get('location')).toBe('https://project.supabase.co/storage/v1/object/sign/x?token=t');
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  expect(mockSign).toHaveBeenCalledWith(`marketing-intern/${ID}.pdf`, 60, undefined);
});

it('downloads under the original file name', async () => {
  await get(ID, '?download=1');
  expect(mockSign).toHaveBeenCalledWith(`marketing-intern/${ID}.pdf`, 60, { download: 'Dubs Resume.pdf' });
});

it('looks like a missing page to non-admins and never signs', async () => {
  mockRequireAdmin.mockResolvedValue({ ok: false });
  const res = await get(ID);
  expect(res.status).toBe(404);
  expect(mockSign).not.toHaveBeenCalled();
});

it('404s for malformed or unknown applications', async () => {
  expect((await get('../../etc')).status).toBe(404);
  mockRow.mockResolvedValue({ data: null });
  expect((await get(ID)).status).toBe(404);
  expect(mockSign).not.toHaveBeenCalled();
});

it('fails closed when signing fails', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockSign.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
  const res = await get(ID);
  expect(res.status).toBe(502);
  expect(res.headers.get('location')).toBeNull();
});
