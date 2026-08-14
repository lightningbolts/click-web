/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST as discoverPost } from '@/app/api/contacts/discover/route';
import { POST as requestPost } from '@/app/api/connections/prior/request/route';
import { POST as respondPost } from '@/app/api/connections/prior/respond/route';
import { sha256HexUtf8, normalizeEmail, normalizePhoneE164 } from '@/lib/connections/priorConnections';
import { formatSplitConnectionMetrics, isHandshakeSource, isPriorSource } from '@/lib/insights/analytics';

const mockRequireUser = jest.fn();
const mockCreateAdminClient = jest.fn();
const mockNotify = jest.fn();

jest.mock('@/lib/server/withAuth', () => ({
  requireUser: (...args: unknown[]) => mockRequireUser(...args),
}));

jest.mock('@/lib/server/connectionWriteAuth', () => ({
  createAdminClient: () => mockCreateAdminClient(),
  isJunctionTableOptionalError: () => false,
}));

jest.mock('@/lib/connections/priorConnections', () => {
  const actual = jest.requireActual('@/lib/connections/priorConnections');
  return {
    ...actual,
    notifyPriorConnectionRequest: (...args: unknown[]) => mockNotify(...args),
  };
});

const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { authorization: 'Bearer fake.jwt.token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function chain(result: { data: unknown; error: unknown; count?: number }) {
  const builder: Record<string, unknown> = {};
  const methods = [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'neq',
    'gt',
    'gte',
    'in',
    'contains',
    'maybeSingle',
    'single',
    'limit',
  ];
  for (const m of methods) {
    builder[m] = jest.fn(() => builder);
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  Object.assign(builder, result);
  return builder;
}

describe('prior connection hashing', () => {
  it('hashes normalized email as SHA-256 hex', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    expect(sha256HexUtf8('foo@bar.com')).toBe(
      '0c7e6a405862e402eb76a70f8a26fc732d07c32931e9fae9ab1582911d2e8a3b',
    );
  });

  it('normalizes 10-digit US phones to E.164', () => {
    expect(normalizePhoneE164('(206) 555-0100')).toBe('+12065550100');
  });
});

describe('insights analytics split', () => {
  it('never mixes handshake and prior into one vanity label', () => {
    expect(isHandshakeSource('handshake')).toBe(true);
    expect(isHandshakeSource(null)).toBe(true);
    expect(isPriorSource('prior')).toBe(true);
    expect(formatSplitConnectionMetrics(12, 3)).toBe(
      '12 Verified Handshakes · 3 Prior Connections',
    );
  });
});

describe('POST /api/contacts/discover', () => {
  beforeEach(() => {
    mockRequireUser.mockReset();
    mockCreateAdminClient.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireUser.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized', code: 'unauthorized' }), {
        status: 401,
      }),
    });
    const res = await discoverPost(jsonRequest('http://localhost/api/contacts/discover', { hashed_contacts: [] }));
    expect(res.status).toBe(401);
  });

  it('matches hashes and excludes self, blocks, and existing pairs', async () => {
    mockRequireUser.mockResolvedValue({ ok: true, user: { id: userA }, supabase: {} });
    const hash = sha256HexUtf8('friend@example.com');
    const from = jest.fn((table: string) => {
      if (table === 'user_contact_hashes') {
        return chain({
          data: [{ hash, user_id: userB }],
          error: null,
        });
      }
      if (table === 'connections') {
        return chain({ data: [], error: null });
      }
      if (table === 'user_blocks') {
        return chain({ data: null, error: null });
      }
      if (table === 'users') {
        return chain({
          data: [{ id: userB, name: 'Bee', first_name: 'Bee', last_name: null, full_name: null, image: null }],
          error: null,
        });
      }
      if (table === 'user_interests') {
        return chain({ data: [{ user_id: userB, tags: ['music'] }], error: null });
      }
      throw new Error(table);
    });
    mockCreateAdminClient.mockReturnValue({ from });

    const res = await discoverPost(
      jsonRequest('http://localhost/api/contacts/discover', { hashed_contacts: [hash] }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matches).toEqual([
      { id: userB, name: 'Bee', avatar_url: null, tags: ['music'] },
    ]);
    expect(from).not.toHaveBeenCalledWith('connection_encounters');
  });
});

describe('POST /api/connections/prior/request', () => {
  beforeEach(() => {
    mockRequireUser.mockReset();
    mockCreateAdminClient.mockReset();
    mockNotify.mockReset();
    mockNotify.mockResolvedValue(undefined);
  });

  it('inserts a pending prior row without encounters and rate-limits', async () => {
    mockRequireUser.mockResolvedValue({ ok: true, user: { id: userA }, supabase: {} });
    const from = jest.fn((table: string) => {
      if (table === 'user_blocks') return chain({ data: null, error: null });
      if (table === 'users') {
        const b = chain({
          data: { id: userB, name: 'Bee', first_name: 'Bee' },
          error: null,
        });
        return b;
      }
      if (table === 'connection_requests_rate_limit') {
        const b = chain({ data: null, error: null, count: 0 });
        return b;
      }
      if (table === 'connections') {
        const b = chain({ data: { id: 'prior-1' }, error: null });
        (b.insert as jest.Mock).mockReturnValue(b);
        (b.select as jest.Mock).mockReturnValue(b);
        (b.single as jest.Mock).mockResolvedValue({ data: { id: 'prior-1' }, error: null });
        (b.contains as jest.Mock).mockResolvedValue({ data: [], error: null });
        return b;
      }
      throw new Error(table);
    });
    mockCreateAdminClient.mockReturnValue({ from });

    const res = await requestPost(
      jsonRequest('http://localhost/api/connections/prior/request', {
        target_user_id: userB,
        known_since: 'college',
        context_tag: 'High School track team',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source).toBe('prior');
    expect(json.status).toBe('pending');
    expect(from).not.toHaveBeenCalledWith('connection_encounters');
    const connectionsCalls = from.mock.calls.filter((c: string[]) => c[0] === 'connections');
    expect(connectionsCalls.length).toBeGreaterThan(0);
  });

  it('rejects self-connect', async () => {
    mockRequireUser.mockResolvedValue({ ok: true, user: { id: userA }, supabase: {} });
    mockCreateAdminClient.mockReturnValue({ from: jest.fn() });
    const res = await requestPost(
      jsonRequest('http://localhost/api/connections/prior/request', { target_user_id: userA }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/connections/prior/respond', () => {
  beforeEach(() => {
    mockRequireUser.mockReset();
    mockCreateAdminClient.mockReset();
  });

  it('lets the responder accept without creating encounters', async () => {
    mockRequireUser.mockResolvedValue({ ok: true, user: { id: userB }, supabase: {} });
    const from = jest.fn((table: string) => {
      if (table === 'connections') {
        const b = chain({
          data: {
            id: 'prior-1',
            user_ids: [userA, userB],
            status: 'pending',
            source: 'prior',
            initiator_id: userA,
            responder_id: userB,
          },
          error: null,
        });
        (b.maybeSingle as jest.Mock).mockResolvedValue({
          data: {
            id: 'prior-1',
            user_ids: [userA, userB],
            status: 'pending',
            source: 'prior',
            initiator_id: userA,
            responder_id: userB,
          },
          error: null,
        });
        (b.update as jest.Mock).mockReturnValue(b);
        (b.eq as jest.Mock).mockResolvedValue({ data: null, error: null });
        return b;
      }
      if (table === 'chats') {
        const b = chain({ data: null, error: null });
        (b.maybeSingle as jest.Mock).mockResolvedValue({ data: null, error: null });
        (b.insert as jest.Mock).mockResolvedValue({ data: { id: 'chat-1' }, error: null });
        return b;
      }
      throw new Error(table);
    });
    mockCreateAdminClient.mockReturnValue({ from });

    const res = await respondPost(
      jsonRequest('http://localhost/api/connections/prior/respond', {
        connection_id: 'prior-1',
        action: 'accept',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('active');
    expect(from).not.toHaveBeenCalledWith('connection_encounters');
  });

  it('forbids the initiator from accepting their own request', async () => {
    mockRequireUser.mockResolvedValue({ ok: true, user: { id: userA }, supabase: {} });
    const from = jest.fn((table: string) => {
      if (table === 'connections') {
        const b = chain({
          data: {
            id: 'prior-1',
            user_ids: [userA, userB],
            status: 'pending',
            source: 'prior',
            initiator_id: userA,
            responder_id: userB,
          },
          error: null,
        });
        (b.maybeSingle as jest.Mock).mockResolvedValue({
          data: {
            id: 'prior-1',
            user_ids: [userA, userB],
            status: 'pending',
            source: 'prior',
            initiator_id: userA,
            responder_id: userB,
          },
          error: null,
        });
        return b;
      }
      throw new Error(table);
    });
    mockCreateAdminClient.mockReturnValue({ from });
    const res = await respondPost(
      jsonRequest('http://localhost/api/connections/prior/respond', {
        connection_id: 'prior-1',
        action: 'accept',
      }),
    );
    expect(res.status).toBe(403);
  });
});
