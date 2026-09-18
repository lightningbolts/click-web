/** @jest-environment node */

import { NextRequest, NextResponse } from 'next/server';
import {
  POST as addReaction,
  DELETE as removeReaction,
} from '@/app/api/hub/reactions/route';
import {
  PATCH as editMessage,
  DELETE as deleteMessage,
} from '@/app/api/hub/messages/[messageId]/route';
import { GET as getHubMessages } from '@/app/api/hub/messages/route';

const mockRequireBearerUser = jest.fn();
const mockCreateAdmin = jest.fn();
const mockParseBody = jest.fn();
const mockAssertHubGeofence = jest.fn();
const mockAssertHubReadable = jest.fn();
const mockAssertHubE2ee = jest.fn();

jest.mock('@/lib/server/chatGatekeeper', () => ({
  requireBearerUser: (...args: unknown[]) => mockRequireBearerUser(...args),
  createChatGatekeeperAdmin: (...args: unknown[]) => mockCreateAdmin(...args),
}));

jest.mock('@/lib/api/parseBody', () => ({
  parseBody: (...args: unknown[]) => mockParseBody(...args),
}));

jest.mock('@/lib/server/hubGatekeeper', () => ({
  assertHubGeofenceFromCoords: (...args: unknown[]) => mockAssertHubGeofence(...args),
  assertHubReadable: (...args: unknown[]) => mockAssertHubReadable(...args),
}));

jest.mock('@/lib/server/hubE2eeV2Gate', () => ({
  assertHubE2eeV2MessageWrite: (...args: unknown[]) => mockAssertHubE2ee(...args),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PEER_ID = '22222222-2222-4222-8222-222222222222';
const HUB_ID = 'hub-1';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

function request(method: string, path: string) {
  return new NextRequest(`https://click.example${path}`, { method });
}

function context(messageId = MESSAGE_ID) {
  return { params: Promise.resolve({ messageId }) };
}

function queryWithMaybeSingle(data: unknown, error: unknown = null) {
  const q: any = {};
  q.select = jest.fn(() => q);
  q.eq = jest.fn(() => q);
  q.maybeSingle = jest.fn().mockResolvedValue({ data, error });
  return q;
}

function insertQuery(data: unknown) {
  const q: any = {};
  q.insert = jest.fn(() => q);
  q.select = jest.fn(() => q);
  q.single = jest.fn().mockResolvedValue({ data, error: null });
  return q;
}

function updateQuery(data: unknown) {
  const q: any = {};
  q.update = jest.fn(() => q);
  q.eq = jest.fn(() => q);
  q.select = jest.fn(() => q);
  q.single = jest.fn().mockResolvedValue({ data, error: null });
  return q;
}

function deleteQuery() {
  const q: any = {};
  q.delete = jest.fn(() => q);
  q.eq = jest.fn(() => q);
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
  return q;
}

function resolvedQuery(data: unknown, error: unknown = null) {
  const q: any = {};
  q.select = jest.fn(() => q);
  q.eq = jest.fn(() => q);
  q.order = jest.fn(() => q);
  q.limit = jest.fn(() => q);
  q.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return q;
}


describe('Hub interaction routes', () => {
  beforeEach(() => {
    mockRequireBearerUser.mockReset().mockResolvedValue({
      ok: true,
      user: { id: USER_ID },
      bearer: 'jwt',
    });
    mockCreateAdmin.mockReset();
    mockParseBody.mockReset();
    mockAssertHubGeofence.mockReset().mockResolvedValue(null);
    mockAssertHubReadable.mockReset().mockResolvedValue(null);
    mockAssertHubE2ee.mockReset().mockResolvedValue({ ok: true, currentEpoch: 3 });
  });

  it('returns an explicit sender-profile visibility decision for hosts-only Event Hubs', async () => {
    const participants = resolvedQuery([
      { user_id: USER_ID },
      { user_id: PEER_ID },
    ]);
    const venue = queryWithMaybeSingle({ event_beacon_id: 'event-1' });
    const event = queryWithMaybeSingle({
      creator_id: PEER_ID,
      guest_list_visibility: 'hosts_only',
    });
    const messages = resolvedQuery([]);
    const from = jest.fn()
      .mockReturnValueOnce(participants)
      .mockReturnValueOnce(venue)
      .mockReturnValueOnce(event)
      .mockReturnValueOnce(messages);
    mockCreateAdmin.mockReturnValue({ from });

    const response = await getHubMessages(
      new NextRequest(`https://click.example/api/hub/messages?hubId=${HUB_ID}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.participant_ids).toEqual([]);
    expect(body.sender_profiles_visible).toBe(false);
    expect(body.occupant_count).toBe(2);
  });

  it('keeps sender profiles visible to the Event host', async () => {
    const participants = resolvedQuery([
      { user_id: USER_ID },
      { user_id: PEER_ID },
    ]);
    const venue = queryWithMaybeSingle({ event_beacon_id: 'event-1' });
    const event = queryWithMaybeSingle({
      creator_id: USER_ID,
      guest_list_visibility: 'hosts_only',
    });
    const messages = resolvedQuery([]);
    const from = jest.fn()
      .mockReturnValueOnce(participants)
      .mockReturnValueOnce(venue)
      .mockReturnValueOnce(event)
      .mockReturnValueOnce(messages);
    mockCreateAdmin.mockReturnValue({ from });

    const response = await getHubMessages(
      new NextRequest(`https://click.example/api/hub/messages?hubId=${HUB_ID}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.participant_ids).toEqual([USER_ID, PEER_ID]);
    expect(body.sender_profiles_visible).toBe(true);
  });

  it('rejects reaction cross-Hub message spoofing before any write', async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: {
        hubId: HUB_ID,
        messageId: MESSAGE_ID,
        reactionType: '❤️',
        userLat: 47.6,
        userLong: -122.3,
      },
    });
    const target = queryWithMaybeSingle({ id: MESSAGE_ID, hub_id: 'hub-other' });
    const from = jest.fn().mockReturnValue(target);
    mockCreateAdmin.mockReturnValue({ from });

    const response = await addReaction(request('POST', '/api/hub/reactions'));

    expect(response.status).toBe(404);
    expect(from).toHaveBeenCalledTimes(1);
    expect(mockAssertHubGeofence).not.toHaveBeenCalled();
  });

  it('binds reaction identity to the authenticated caller and canonical target Hub', async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: {
        hubId: HUB_ID,
        messageId: MESSAGE_ID,
        reactionType: '❤️',
        userLat: 47.6,
        userLong: -122.3,
      },
    });
    const target = queryWithMaybeSingle({ id: MESSAGE_ID, hub_id: HUB_ID });
    const reaction = {
      id: 'reaction-1',
      hub_message_id: MESSAGE_ID,
      hub_id: HUB_ID,
      user_id: USER_ID,
      reaction_type: '❤️',
      created_at: '2026-09-18T00:00:00.000Z',
    };
    const write = insertQuery(reaction);
    const from = jest.fn()
      .mockReturnValueOnce(target)
      .mockReturnValueOnce(write);
    mockCreateAdmin.mockReturnValue({ from });

    const response = await addReaction(request('POST', '/api/hub/reactions'));

    expect(response.status).toBe(201);
    expect(write.insert).toHaveBeenCalledWith({
      hub_message_id: MESSAGE_ID,
      hub_id: HUB_ID,
      user_id: USER_ID,
      reaction_type: '❤️',
    });
  });

  it('revalidates access before reaction writes', async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: {
        hubId: HUB_ID,
        messageId: MESSAGE_ID,
        reactionType: '👍',
        userLat: 47.6,
        userLong: -122.3,
      },
    });
    const target = queryWithMaybeSingle({ id: MESSAGE_ID, hub_id: HUB_ID });
    const from = jest.fn().mockReturnValue(target);
    mockCreateAdmin.mockReturnValue({ from });
    mockAssertHubGeofence.mockResolvedValue(
      NextResponse.json({ error: 'HUB_EXPIRED' }, { status: 410 }),
    );

    const response = await addReaction(request('POST', '/api/hub/reactions'));

    expect(response.status).toBe(410);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('scopes reaction removal to the authenticated caller', async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: {
        hubId: HUB_ID,
        messageId: MESSAGE_ID,
        reactionType: '😂',
        userLat: 47.6,
        userLong: -122.3,
      },
    });
    const target = queryWithMaybeSingle({ id: MESSAGE_ID, hub_id: HUB_ID });
    const write = deleteQuery();
    const from = jest.fn()
      .mockReturnValueOnce(target)
      .mockReturnValueOnce(write);
    mockCreateAdmin.mockReturnValue({ from });

    const response = await removeReaction(request('DELETE', '/api/hub/reactions'));

    expect(response.status).toBe(200);
    expect(write.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(write.eq).toHaveBeenCalledWith('reaction_type', '😂');
  });

  it('rejects edits from anyone except the original sender', async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: { hubId: HUB_ID, userLat: 47.6, userLong: -122.3, body: 'edited' },
    });
    const target = queryWithMaybeSingle({
      id: MESSAGE_ID,
      hub_id: HUB_ID,
      user_id: PEER_ID,
      message_type: 'text',
      metadata: {},
    });
    mockCreateAdmin.mockReturnValue({ from: jest.fn().mockReturnValue(target) });

    const response = await editMessage(
      request('PATCH', `/api/hub/messages/${MESSAGE_ID}`),
      context(),
    );

    expect(response.status).toBe(403);
    expect(mockAssertHubGeofence).not.toHaveBeenCalled();
    expect(mockAssertHubE2ee).not.toHaveBeenCalled();
  });

  it('rejects cross-Hub message mutation spoofing', async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: { hubId: HUB_ID, userLat: 47.6, userLong: -122.3, body: 'edited' },
    });
    const target = queryWithMaybeSingle({
      id: MESSAGE_ID,
      hub_id: 'hub-other',
      user_id: USER_ID,
      message_type: 'text',
      metadata: {},
    });
    mockCreateAdmin.mockReturnValue({ from: jest.fn().mockReturnValue(target) });

    const response = await editMessage(
      request('PATCH', `/api/hub/messages/${MESSAGE_ID}`),
      context(),
    );

    expect(response.status).toBe(404);
  });

  it('preserves stored metadata on body-only edit and runs the E2EE gate before update', async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: { hubId: HUB_ID, userLat: 47.6, userLong: -122.3, body: 'edited' },
    });
    const storedMetadata = { reply_to_id: 'reply-1', custom: 'keep' };
    const target = queryWithMaybeSingle({
      id: MESSAGE_ID,
      hub_id: HUB_ID,
      user_id: USER_ID,
      message_type: 'text',
      metadata: storedMetadata,
    });
    const updated = {
      id: MESSAGE_ID,
      hub_id: HUB_ID,
      user_id: USER_ID,
      body: 'edited',
      created_at: '2026-09-18T00:00:00.000Z',
      edited_at: '2026-09-18T00:01:00.000Z',
      message_type: 'text',
      metadata: storedMetadata,
    };
    const write = updateQuery(updated);
    const from = jest.fn()
      .mockReturnValueOnce(target)
      .mockReturnValueOnce(write);
    mockCreateAdmin.mockReturnValue({ from });

    const response = await editMessage(
      request('PATCH', `/api/hub/messages/${MESSAGE_ID}`),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mockAssertHubE2ee).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        hubId: HUB_ID,
        userId: USER_ID,
        content: 'edited',
      }),
    );
    expect(write.update).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'edited',
        metadata: storedMetadata,
        edited_at: expect.any(String),
      }),
    );
  });

  it('does not update when the E2EE edit envelope is rejected', async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: {
        hubId: HUB_ID,
        userLat: 47.6,
        userLong: -122.3,
        body: 'e2e2:bad',
        metadata: {
          epoch: 3,
          sender_device_id: 'device-a',
          client_message_id: 'edit-1',
        },
      },
    });
    const target = queryWithMaybeSingle({
      id: MESSAGE_ID,
      hub_id: HUB_ID,
      user_id: USER_ID,
      message_type: 'text',
      metadata: {},
    });
    const from = jest.fn().mockReturnValue(target);
    mockCreateAdmin.mockReturnValue({ from });
    mockAssertHubE2ee.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'HUB_E2EE_V2_INVALID' }, { status: 400 }),
    });

    const response = await editMessage(
      request('PATCH', `/api/hub/messages/${MESSAGE_ID}`),
      context(),
    );

    expect(response.status).toBe(400);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('revalidates access before deleting an owned Hub message', async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: { hubId: HUB_ID, userLat: 47.6, userLong: -122.3 },
    });
    const target = queryWithMaybeSingle({
      id: MESSAGE_ID,
      hub_id: HUB_ID,
      user_id: USER_ID,
      message_type: 'text',
      metadata: {},
    });
    const from = jest.fn().mockReturnValue(target);
    mockCreateAdmin.mockReturnValue({ from });
    mockAssertHubGeofence.mockResolvedValue(
      NextResponse.json({ error: 'OUT_OF_BOUNDS' }, { status: 403 }),
    );

    const response = await deleteMessage(
      request('DELETE', `/api/hub/messages/${MESSAGE_ID}`),
      context(),
    );

    expect(response.status).toBe(403);
    expect(from).toHaveBeenCalledTimes(1);
  });
});
