/** @jest-environment node */

jest.mock('server-only', () => ({}));

import { makeSupabaseMock } from '../../helpers/supabaseRouteMocks';
import { serializeEventDrops, type EventDropRow } from '@/lib/server/eventDrops';

const VIEWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = Date.parse('2026-10-05T18:00:00Z');

function row(id: string, revealAt: string): EventDropRow {
  return {
    id,
    beacon_id: 'b1',
    user_id: VIEWER,
    client_drop_id: `c-${id}`,
    original_path: `event/b1/${VIEWER}/${id}-original.jpg`,
    preview_path: `event/b1/${VIEWER}/${id}-preview.jpg`,
    width: 3,
    height: 4,
    filter_seed: 1,
    show_to_absentees: true,
    created_at: '2026-10-04T20:00:00.000Z',
    reveal_at: revealAt,
  } as EventDropRow;
}

function setup() {
  const mock = makeSupabaseMock({ tables: { users: { data: [{ id: VIEWER, name: 'Kai' }], error: null } } });
  const createSignedUrls = jest.fn(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })),
    error: null,
  }));
  const admin = { ...mock.supabase, storage: { from: jest.fn(() => ({ createSignedUrls })) } };
  return { admin, createSignedUrls };
}

describe('serializeEventDrops', () => {
  it('signs originals only for revealed drops, in the same call as the previews', async () => {
    const { admin, createSignedUrls } = setup();
    const drops = await serializeEventDrops(
      admin as never,
      [row('d1', '2026-10-05T17:00:00.000Z'), row('d2', '2026-10-06T17:00:00.000Z')],
      VIEWER,
      NOW,
    );
    expect(drops[0].original_url).toBe(`https://signed/event/b1/${VIEWER}/d1-original.jpg`);
    expect(drops[1].original_url).toBeNull();
    expect(drops[1].preview_url).toBe(`https://signed/event/b1/${VIEWER}/d2-preview.jpg`);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls.mock.calls[0][0]).not.toContain(`event/b1/${VIEWER}/d2-original.jpg`);
  });

  it('never signs originals without a reveal check (posting)', async () => {
    const { admin, createSignedUrls } = setup();
    const [drop] = await serializeEventDrops(admin as never, [row('d1', '2026-10-05T17:00:00.000Z')], VIEWER);
    expect(drop.original_url).toBeNull();
    expect(createSignedUrls.mock.calls[0][0]).toEqual([`event/b1/${VIEWER}/d1-preview.jpg`]);
  });
});
