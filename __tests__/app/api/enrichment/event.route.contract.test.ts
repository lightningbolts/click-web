/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST as enrichmentPost } from '@/app/api/enrichment/event/route';

const mockRunPipeline = jest.fn();
const mockCreateAdmin = jest.fn();

jest.mock('@/lib/server/admin/supabaseAdmin', () => ({
  createAdminSupabaseClient: () => mockCreateAdmin(),
}));

jest.mock('@/lib/enrichment/runEncounterEnrichment', () => ({
  runEncounterEnrichment: (...args: unknown[]) => mockRunPipeline(...args),
}));

describe('POST /api/enrichment/event contract', () => {
  const encounterId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  beforeEach(() => {
    mockRunPipeline.mockReset();
    mockCreateAdmin.mockReturnValue({});
    delete process.env.ENRICHMENT_WEBHOOK_SECRET;
  });

  it('returns 200 with pipeline result on valid payload', async () => {
    mockRunPipeline.mockResolvedValue({
      event: {
        encounter_id: encounterId,
        event_id: 'tm_abc123',
        venue_name: 'T-Mobile Park',
        status: 'resolved',
      },
      vibe: {
        encounter_id: encounterId,
        status: 'classified',
        vibe_capture: { archetype: 'Night Out' },
      },
    });

    const req = new NextRequest('http://localhost/api/enrichment/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        encounter_id: encounterId,
        lat: 47.5914,
        lon: -122.3325,
        timestamp: '2026-06-02T20:00:00.000Z',
      }),
    });

    const res = await enrichmentPost(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.success).toBe(true);
    expect(json.event_id).toBe('tm_abc123');
    expect(json.vibe).toEqual(
      expect.objectContaining({ status: 'classified' }),
    );
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid encounter_id', async () => {
    const req = new NextRequest('http://localhost/api/enrichment/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        encounter_id: 'not-a-uuid',
        lat: 47.5914,
        lon: -122.3325,
        timestamp: '2026-06-02T20:00:00.000Z',
      }),
    });

    const res = await enrichmentPost(req);
    expect(res.status).toBe(400);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });
});
