import { renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { useConnectionsData } from '@/components/dashboard/useConnectionsData';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import type { InboxPreload } from '@/lib/clicks/inboxPreload';

jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => null }));

const viewer = { id: 'me' };

function preload(loadedAt: number): InboxPreload {
  return {
    userId: 'me',
    loadedAt,
    bundle: {
      active: [{ id: 'c1', user_ids: ['me', 'ada'], status: 'active', created: '2026-10-01T00:00:00Z' }],
      archived: [],
      map: [],
      core: [],
    },
    names: { ada: 'Ada Lovelace' },
    images: { ada: null },
    selfIntents: [],
    peerIntents: [],
  };
}

function useHarness(p: Promise<InboxPreload | null>, getAuthHeaders: () => Promise<HeadersInit>) {
  const [records, setRecords] = useState<ConnectionRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const noop = () => {};
  useConnectionsData({
    user: viewer,
    getAuthHeaders,
    connectionRecords: records,
    setConnectionRecords: setRecords,
    setMapConnectionRecords: noop,
    setArchivedConnectionIds: noop,
    setCoreConnectionIds: noop,
    setConnectionsInitialLoadComplete: setLoaded,
    updateArchivedIds: noop,
    setVibePromptConnection: noop,
    preload: p,
  });
  return { records, loaded };
}

describe('useConnectionsData preload', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('renders a fresh server preload without fetching', async () => {
    const getAuthHeaders = jest.fn().mockResolvedValue({});
    const { result } = renderHook(() => useHarness(Promise.resolve(preload(Date.now())), getAuthHeaders));
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    expect(result.current.records[0].name).toBe('Ada Lovelace');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getAuthHeaders).not.toHaveBeenCalled();
  });

  it('fetches fresh when the preload is stale', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ active: [], archived: [], map: [], core: [] }) });
    const getAuthHeaders = jest.fn().mockResolvedValue({});
    renderHook(() => useHarness(Promise.resolve(preload(Date.now() - 60_000)), getAuthHeaders));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/connections?bundle=dashboard', expect.anything()),
    );
  });
});
