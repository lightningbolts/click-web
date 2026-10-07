import { previewLabelForMessage } from '@/lib/chat/mediaMetadata';
import { dropReplyFromMetadata } from '@/lib/drops/dropReply';

describe('dropReplyFromMetadata', () => {
  it('reads iOS ChatDropReply wire metadata', () => {
    expect(dropReplyFromMetadata({ drop_reply: { kind: 'shared', id: 'd1', reaction: true } })).toEqual({ kind: 'shared', id: 'd1', reaction: true });
    expect(dropReplyFromMetadata({ drop_reply: { kind: 'shared', id: 'd1' } })).toEqual({ kind: 'shared', id: 'd1', reaction: false });
  });

  it('ignores anything else', () => {
    expect(dropReplyFromMetadata(null)).toBeNull();
    expect(dropReplyFromMetadata({ drop_reply: { kind: 'event', id: 'd1' } })).toBeNull();
    expect(dropReplyFromMetadata({ drop_reply: { kind: 'shared', id: '' } })).toBeNull();
    expect(dropReplyFromMetadata({ drop_reply: ['shared'] })).toBeNull();
  });
});

describe('previewLabelForMessage for drop replies', () => {
  const meta = (reaction: boolean) => ({ drop_reply: { kind: 'shared', id: 'd1', reaction } }) as never;

  it('says what answered the drop, like iOS quotes', () => {
    expect(previewLabelForMessage({ message_type: 'text', content: '🔥', metadata: meta(true) })).toBe('Reacted 🔥 to a drop');
    expect(previewLabelForMessage({ message_type: 'text', content: 'so good\nwow', metadata: meta(false) })).toBe('Replied to a drop: so good wow');
  });

  it('never labels ciphertext', () => {
    expect(previewLabelForMessage({ message_type: 'text', content: 'e2e2:abc', metadata: meta(false) })).toBe('Encrypted message');
  });
});
