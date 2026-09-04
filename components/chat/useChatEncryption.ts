'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { Message } from '@/lib/chat/types';
import { previewLabelForMessage } from '@/lib/chat/mediaMetadata';
import { isBeaconChatMessage, shouldSkipChatDecrypt } from '@/lib/chat/messages';
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
import {
  decryptWebE2eeV2Message,
  resolveWebE2eeV2Session,
  type E2eeV2Session,
} from '@/lib/chat/e2eeV2Client';

/**
 * E2EE state for one chat: pairwise derived keys or the group master key,
 * plus the decrypt/reply-metadata helpers that depend on them and the
 * decrypted reply-banner text. Extracted verbatim from ChatView.
 */
export function useChatEncryption({
  connection,
  currentUserId,
  isGroupClique,
  chatId,
  getAuthHeaders,
  replyingTo,
}: {
  connection: ConnectionRecord;
  currentUserId: string;
  isGroupClique: boolean;
  chatId: string | null;
  getAuthHeaders: () => Promise<HeadersInit>;
  replyingTo: Message | null;
}) {
  const [e2eKeys, setE2eKeys] = useState<DerivedKeys | null>(null);
  /** Raw 32-byte AES group master for verified clique chats (matches mobile `MessageCrypto`). */
  const [groupMasterKey, setGroupMasterKey] = useState<ArrayBuffer | null>(null);
  const [groupKeyError, setGroupKeyError] = useState<string | null>(null);
  const [replyBannerText, setReplyBannerText] = useState('');

  const getE2eeV2Session = useCallback(async (allowUpgrade = false, forceRefresh = false): Promise<E2eeV2Session | null> => {
    if (!chatId) return null;
    const participantUserIds = connection.userIds ?? (connection.otherUserId ? [currentUserId, connection.otherUserId] : []);
    return resolveWebE2eeV2Session({
      chatId,
      participantUserIds,
      getAuthHeaders,
      allowUpgrade,
      forceRefresh,
    });
  }, [chatId, connection.userIds, connection.otherUserId, currentUserId, getAuthHeaders]);

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
      if (shouldSkipChatDecrypt(messageType)) return content ?? '';
      if (content?.startsWith('e2e2:')) {
        const session = await getE2eeV2Session(false);
        if (!session) return 'Encrypted message';
        return decryptWebE2eeV2Message(session, content);
      }
      if (isGroupClique && groupMasterKey && isGroupMessageEncrypted(content)) {
        return decryptGroupMessageContent(content, groupMasterKey);
      }
      if (e2eKeys && isEncrypted(content)) {
        return decryptContent(content, e2eKeys);
      }
      return content ?? '';
    },
    [isGroupClique, groupMasterKey, e2eKeys, getE2eeV2Session],
  );

  const appendReplyToMetadata = useCallback(
    async (meta: Record<string, unknown>): Promise<Record<string, unknown>> => {
      if (!replyingTo || shouldSkipChatDecrypt(replyingTo.message_type)) return meta;
      let snippetSource = replyingTo.content;
      if (replyingTo.content.startsWith('e2e2:')) {
        const session = await getE2eeV2Session(false);
        if (session) snippetSource = await decryptWebE2eeV2Message(session, replyingTo.content);
      } else if (isGroupClique && groupMasterKey && isGroupMessageEncrypted(replyingTo.content)) {
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
    [replyingTo, e2eKeys, groupMasterKey, isGroupClique, getE2eeV2Session],
  );

  useEffect(() => {
    if (!replyingTo || shouldSkipChatDecrypt(replyingTo.message_type)) {
      setReplyBannerText('');
      return;
    }
    if (
      replyingTo.message_type === 'image' ||
      replyingTo.message_type === 'audio' ||
      isBeaconChatMessage(replyingTo)
    ) {
      const raw = replyingTo.content;
      if (!isAnyE2eeWireContent(raw)) {
        setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: raw }));
        return;
      }
      if (raw.startsWith('e2e2:')) {
        let cancelled = false;
        getE2eeV2Session(false).then(
          async (session) => {
            if (cancelled) return;
            try {
              const plain = session ? await decryptWebE2eeV2Message(session, raw) : '';
              if (!cancelled) setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: plain }));
            } catch {
              if (!cancelled) setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: '' }));
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
  }, [replyingTo, e2eKeys, groupMasterKey, isGroupClique, getE2eeV2Session]);

  return {
    e2eKeys,
    groupMasterKey,
    groupKeyError,
    replyBannerText,
    decryptWireMessageContent,
    appendReplyToMetadata,
    getE2eeV2Session,
  };
}
