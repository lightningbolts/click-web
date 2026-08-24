'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { Message } from '@/lib/chat/types';
import { previewLabelForMessage } from '@/lib/chat/mediaMetadata';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import {
  deriveKeysForConnection,
  decryptContent,
  isEncrypted,
  isGroupMessageEncrypted,
  isAnyE2eeWireContent,
  decryptGroupMessageContent,
  type DerivedKeys,
} from '@/lib/chat/crypto';
import { unwrapGroupMasterKeyBytes } from '@/lib/chat/groupCliqueKey';
import { replySnippetForSend } from '@/lib/chat/reply';

/**
 * E2EE state for one chat: pairwise derived keys or the group master key,
 * plus the decrypt/reply-metadata helpers that depend on them and the
 * decrypted reply-banner text. Extracted verbatim from ChatView.
 */
export function useChatEncryption({
  connection,
  currentUserId,
  isGroupClique,
  replyingTo,
}: {
  connection: ConnectionRecord;
  currentUserId: string;
  isGroupClique: boolean;
  replyingTo: Message | null;
}) {
  const [e2eKeys, setE2eKeys] = useState<DerivedKeys | null>(null);
  /** Raw 32-byte AES group master for verified clique chats (matches mobile `MessageCrypto`). */
  const [groupMasterKey, setGroupMasterKey] = useState<ArrayBuffer | null>(null);
  const [groupKeyError, setGroupKeyError] = useState<string | null>(null);
  const [replyBannerText, setReplyBannerText] = useState('');

  useEffect(() => {
    if (isGroupClique) {
      setE2eKeys(null);
      return;
    }
    const userIds = connection.userIds ?? (connection.otherUserId ? [currentUserId, connection.otherUserId] : []);
    if (userIds.length >= 2) {
      deriveKeysForConnection(connection.id, userIds).then(setE2eKeys);
    }
  }, [connection.id, connection.userIds, connection.otherUserId, currentUserId, isGroupClique]);

  useEffect(() => {
    if (!isGroupClique) {
      setGroupMasterKey(null);
      setGroupKeyError(null);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setGroupKeyError('Sign in required');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const master = await unwrapGroupMasterKeyBytes(supabase, {
          groupId: connection.id,
          viewerUserId: currentUserId,
        });
        if (cancelled) return;
        if (!master) {
          setGroupKeyError('Could not unlock group encryption for this device.');
          setGroupMasterKey(null);
          return;
        }
        setGroupKeyError(null);
        setGroupMasterKey(master);
      } catch {
        if (!cancelled) {
          setGroupKeyError('Could not unlock group encryption.');
          setGroupMasterKey(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection.id, currentUserId, isGroupClique]);

  /** Decrypt wire `content` for display — same rules as the Supabase realtime handler. */
  const decryptWireMessageContent = useCallback(
    async (content: string, messageType: string): Promise<string> => {
      if (messageType === 'call_log') return content ?? '';
      if (isGroupClique && groupMasterKey && isGroupMessageEncrypted(content)) {
        return decryptGroupMessageContent(content, groupMasterKey);
      }
      if (e2eKeys && isEncrypted(content)) {
        return decryptContent(content, e2eKeys);
      }
      return content ?? '';
    },
    [isGroupClique, groupMasterKey, e2eKeys],
  );

  const appendReplyToMetadata = useCallback(
    async (meta: Record<string, unknown>): Promise<Record<string, unknown>> => {
      if (!replyingTo || replyingTo.message_type === 'call_log') return meta;
      let snippetSource = replyingTo.content;
      if (isGroupClique && groupMasterKey && isGroupMessageEncrypted(replyingTo.content)) {
        snippetSource = await decryptGroupMessageContent(replyingTo.content, groupMasterKey);
      } else if (e2eKeys && isEncrypted(replyingTo.content)) {
        snippetSource = await decryptContent(replyingTo.content, e2eKeys);
      }
      const replyLabel =
        replyingTo.message_type === 'image' || replyingTo.message_type === 'audio'
          ? previewLabelForMessage({ ...replyingTo, content: snippetSource })
          : snippetSource;
      return {
        ...meta,
        reply_to_id: replyingTo.id,
        reply_to_content: replySnippetForSend(replyLabel, 140),
      };
    },
    [replyingTo, e2eKeys, groupMasterKey, isGroupClique],
  );

  useEffect(() => {
    if (!replyingTo || replyingTo.message_type === 'call_log') {
      setReplyBannerText('');
      return;
    }
    if (replyingTo.message_type === 'image' || replyingTo.message_type === 'audio') {
      const raw = replyingTo.content;
      if (!isAnyE2eeWireContent(raw)) {
        setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: raw }));
        return;
      }
      if (isGroupClique) {
        if (!groupMasterKey || !isGroupMessageEncrypted(raw)) {
          setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: '' }));
          return;
        }
        let cancelled = false;
        decryptGroupMessageContent(raw, groupMasterKey).then(
          (plain) => {
            if (!cancelled) {
              setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: plain }));
            }
          },
          () => {
            if (!cancelled) setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: '' }));
          },
        );
        return () => {
          cancelled = true;
        };
      }
      if (!e2eKeys) {
        setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: '' }));
        return;
      }
      let cancelled = false;
      decryptContent(raw, e2eKeys).then(
        (plain) => {
          if (!cancelled) {
            setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: plain }));
          }
        },
        () => {
          if (!cancelled) setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: '' }));
        },
      );
      return () => {
        cancelled = true;
      };
    }
    const raw = replyingTo.content;
    if (!isAnyE2eeWireContent(raw)) {
      setReplyBannerText(replySnippetForSend(raw, 120));
      return;
    }
    if (isGroupClique) {
      if (!groupMasterKey || !isGroupMessageEncrypted(raw)) {
        setReplyBannerText('Encrypted message');
        return;
      }
      let cancelledG = false;
      decryptGroupMessageContent(raw, groupMasterKey).then(
        (plain) => {
          if (!cancelledG) setReplyBannerText(replySnippetForSend(plain, 120));
        },
        () => {
          if (!cancelledG) setReplyBannerText('Encrypted message');
        },
      );
      return () => {
        cancelledG = true;
      };
    }
    if (!e2eKeys) {
      setReplyBannerText('Encrypted message');
      return;
    }
    let cancelled = false;
    decryptContent(raw, e2eKeys).then(
      (plain) => {
        if (!cancelled) setReplyBannerText(replySnippetForSend(plain, 120));
      },
      () => {
        if (!cancelled) setReplyBannerText('Encrypted message');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [replyingTo, e2eKeys, groupMasterKey, isGroupClique]);

  return {
    e2eKeys,
    groupMasterKey,
    groupKeyError,
    replyBannerText,
    decryptWireMessageContent,
    appendReplyToMetadata,
  };
}
