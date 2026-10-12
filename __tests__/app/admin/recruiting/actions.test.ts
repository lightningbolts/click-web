/** @jest-environment node */
import { saveApplicationNotesAction, setApplicationStatusAction } from '@/app/(admin)/admin/recruiting/actions';

const ID = '932067f1-765d-43a1-b5e2-c73fa754dab3';
const mockRequireAdmin = jest.fn();
const mockRpc = jest.fn();
const mockRevalidate = jest.fn();

jest.mock('@/lib/server/careers', () => ({
  ...jest.requireActual('@/lib/server/careers'),
  requireRecruitingAdmin: () => mockRequireAdmin(),
}));
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => mockRevalidate(...args) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ ok: true, supabase: { rpc: mockRpc }, user: { id: 'admin' } });
});

describe('setApplicationStatusAction', () => {
  it('compare-and-sets the status and refreshes the dashboard', async () => {
    mockRpc.mockResolvedValue({ data: '2026-10-12T17:00:00Z', error: null });
    await expect(setApplicationStatusAction(ID, 'new', 'shortlisted')).resolves.toEqual({ ok: true, at: '2026-10-12T17:00:00Z' });
    expect(mockRpc).toHaveBeenCalledWith('set_job_application_status', { p_application_id: ID, p_from: 'new', p_to: 'shortlisted' });
    expect(mockRevalidate).toHaveBeenCalledWith('/admin/recruiting', 'layout');
  });

  it('rejects malformed input before touching the database', async () => {
    for (const [id, from, to] of [['nope', 'new', 'accepted'], [ID, 'new', 'hired'], [ID, 'pending', 'new']]) {
      await expect(setApplicationStatusAction(id, from, to)).resolves.toEqual({ ok: false, error: 'Invalid request.' });
    }
    expect(mockRequireAdmin).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuses non-admins without calling the RPC', async () => {
    mockRequireAdmin.mockResolvedValue({ ok: false });
    await expect(setApplicationStatusAction(ID, 'new', 'accepted')).resolves.toMatchObject({ ok: false });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('reports a concurrent change as a conflict', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PT409', message: 'application changed' } });
    await expect(setApplicationStatusAction(ID, 'new', 'accepted')).resolves.toMatchObject({ ok: false, conflict: true });
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('maps missing applications and lost access to clear messages', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: 'x' } });
    await expect(setApplicationStatusAction(ID, 'new', 'accepted')).resolves.toEqual({ ok: false, error: 'This application no longer exists.' });
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'x' } });
    await expect(setApplicationStatusAction(ID, 'new', 'accepted')).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/admin access/) });
  });
});

describe('saveApplicationNotesAction', () => {
  it('saves against the version the editor loaded', async () => {
    mockRpc.mockResolvedValue({ data: '2026-10-12T18:00:00Z', error: null });
    await expect(saveApplicationNotesAction(ID, 'Call\r\nher\u0000', '2026-10-12T17:00:00Z')).resolves.toEqual({ ok: true, at: '2026-10-12T18:00:00Z' });
    expect(mockRpc).toHaveBeenCalledWith('set_job_application_notes', {
      p_application_id: ID,
      p_notes: 'Call\nher',
      p_expected_notes_updated_at: '2026-10-12T17:00:00Z',
    });
  });

  it('rejects oversized notes and bad timestamps', async () => {
    await expect(saveApplicationNotesAction(ID, 'x'.repeat(10_001), null)).resolves.toMatchObject({ ok: false });
    await expect(saveApplicationNotesAction(ID, 'ok', 'yesterday')).resolves.toEqual({ ok: false, error: 'Invalid request.' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('reports a stale save as a conflict', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PT409', message: 'application changed' } });
    await expect(saveApplicationNotesAction(ID, 'mine', null)).resolves.toMatchObject({ ok: false, conflict: true });
  });
});
