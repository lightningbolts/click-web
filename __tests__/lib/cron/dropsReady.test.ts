/** @jest-environment node */

import { dropReadyCopy, groupReadyDropsByRecipient } from '@/lib/cron/dropsReady';

describe('drops ready batching', () => {
  const drops = [
    { messageId: 'm1', chatId: 'c1', revealAtMs: 1 },
    { messageId: 'm2', chatId: 'c1', revealAtMs: 2 },
    { messageId: 'm3', chatId: 'c2', revealAtMs: 3 },
  ];
  const participants = new Map([
    ['c1', ['alice', 'bob']],
    ['c2', ['alice', 'carol']],
  ]);

  it('gives each recipient one batch across all their chats', () => {
    const grouped = groupReadyDropsByRecipient(drops, participants, new Map());
    expect(grouped.get('alice')?.map((d) => d.messageId)).toEqual(['m1', 'm2', 'm3']);
    expect(grouped.get('bob')?.map((d) => d.messageId)).toEqual(['m1', 'm2']);
    expect(grouped.get('carol')?.map((d) => d.messageId)).toEqual(['m3']);
  });

  it('skips chats the recipient muted', () => {
    const grouped = groupReadyDropsByRecipient(drops, participants, new Map([['alice', new Set(['c1'])]]));
    expect(grouped.get('alice')?.map((d) => d.messageId)).toEqual(['m3']);
  });

  it('writes calm, count-aware copy', () => {
    expect(dropReadyCopy(1).body).toBe('Your Click Drop from yesterday is ready to develop.');
    expect(dropReadyCopy(3).body).toBe('3 Click Drops from yesterday are ready to develop.');
  });
});
