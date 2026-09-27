import { activeMute, muteStatusLabel } from '@/lib/chat/conversationApi';

describe('conversation mutes', () => {
  const now = Date.parse('2026-09-27T12:00:00Z');

  it('matches a mute stored under any of the conversation ids and ignores expired ones', () => {
    const mutes = [
      { chat_id: 'conn-1', muted_until: null },
      { chat_id: 'chat-2', muted_until: '2026-09-27T11:00:00Z' },
    ];
    expect(activeMute(mutes, ['chat-1', 'conn-1'], now)).toEqual(mutes[0]);
    expect(activeMute(mutes, ['chat-2'], now)).toBeNull();
    expect(activeMute(undefined, ['chat-1'], now)).toBeNull();
  });

  it('describes the state', () => {
    expect(muteStatusLabel(null)).toBe('On');
    expect(muteStatusLabel({ chat_id: 'x', muted_until: null })).toBe('Muted');
    expect(muteStatusLabel({ chat_id: 'x', muted_until: '2026-09-28T12:00:00Z' })).toMatch(/^Muted until /);
  });
});
