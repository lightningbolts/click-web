import {
  hubInteractionBodySchema,
  hubReactionBodySchema,
} from '@/lib/api/schemas/beacons';

describe('Hub interaction schemas', () => {
  it('normalizes snake_case aliases for message mutations', () => {
    expect(
      hubInteractionBodySchema.parse({
        hub_id: 'hub-1',
        user_lat: 47.6,
        user_long: -122.3,
        body: ' edited ',
      }),
    ).toMatchObject({
      hubId: 'hub-1',
      userLat: 47.6,
      userLong: -122.3,
      body: 'edited',
    });
  });

  it('normalizes reaction aliases and rejects empty or oversized reactions', () => {
    expect(
      hubReactionBodySchema.parse({
        hub_id: 'hub-1',
        message_id: 'message-1',
        reaction_type: ' ❤️ ',
        user_lat: 47.6,
        user_long: -122.3,
      }),
    ).toMatchObject({
      hubId: 'hub-1',
      messageId: 'message-1',
      reactionType: '❤️',
    });

    expect(() =>
      hubReactionBodySchema.parse({
        hubId: 'hub-1',
        messageId: 'message-1',
        reactionType: '   ',
        userLat: 47.6,
        userLong: -122.3,
      }),
    ).toThrow();

    expect(() =>
      hubReactionBodySchema.parse({
        hubId: 'hub-1',
        messageId: 'message-1',
        reactionType: 'x'.repeat(33),
        userLat: 47.6,
        userLong: -122.3,
      }),
    ).toThrow();
  });
});
