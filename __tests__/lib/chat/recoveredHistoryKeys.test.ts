/** @jest-environment node */
import {
  clearRecoveredHistory, installRecoveredHistory, recoveredHistoryFor,
} from '@/lib/chat/recoveredHistoryKeys';

afterEach(() => clearRecoveredHistory());

describe('passkey-unlocked historical epoch cache', () => {
  it('indexes chat and hub epochs separately by account', () => {
    installRecoveredHistory({
      version: 1, userId: 'user-a',
      keys: [
        { scope: 'chat', id: 'same-id', epoch: 1, key: Buffer.alloc(32, 8).toString('base64') },
        { scope: 'hub', id: 'same-id', epoch: 1, key: Buffer.alloc(32, 9).toString('base64') },
      ],
    });
    expect(recoveredHistoryFor('chat', 'same-id', 'user-a')?.get(1)).toEqual(new Uint8Array(32).fill(8));
    expect(recoveredHistoryFor('hub', 'same-id', 'user-a')?.get(1)).toEqual(new Uint8Array(32).fill(9));
    expect(recoveredHistoryFor('chat', 'same-id', 'user-b')).toBeNull();
    clearRecoveredHistory();
    expect(recoveredHistoryFor('chat', 'same-id', 'user-a')).toBeNull();
  });

  it('never retains the previous account on another restoration', () => {
    installRecoveredHistory({
      version: 1, userId: 'user-a',
      keys: [{ scope: 'chat', id: 'a', epoch: 1, key: Buffer.alloc(32, 1).toString('base64') }],
    });
    installRecoveredHistory({
      version: 1, userId: 'user-b',
      keys: [{ scope: 'chat', id: 'b', epoch: 2, key: Buffer.alloc(32, 2).toString('base64') }],
    });
    expect(recoveredHistoryFor('chat', 'a', 'user-a')).toBeNull();
    expect(recoveredHistoryFor('chat', 'b', 'user-b')?.has(2)).toBe(true);
  });
});
