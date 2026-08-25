'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { coerceMessageType } from '@/lib/chat/messages';
import {
  decodeFileMasterKeyBase64,
  decryptFileBytes,
  sha256Base64,
} from '@/lib/chat/attachmentCrypto';
import {
  decryptContent,
  decryptGroupMessageContent,
  deriveKeysForConnection,
  isEncrypted,
  isGroupMessageEncrypted,
  type DerivedKeys,
} from '@/lib/chat/crypto';
import { unwrapGroupMasterKeyBytes } from '@/lib/chat/groupCliqueKey';
import { getSupabaseClient } from '@/lib/supabase';
import { authFailureMessage } from '@/lib/auth/freshAuthHeaders';
import { createSecureMediaObjectUrl, type SecureMediaChatKey } from '@/lib/chat/useSecureMedia';
import { downloadAttachmentCiphertext, signChatAttachmentUrl } from '@/lib/chat/chatAttachmentStorage';
import type {
  BeaconPreviewItem,
  ChatMessagesPayload,
  CollaborationSessionResponse,
  ConnectionTabsPayload,
  DecryptedProfileMessage,
  EventRecommendationPayload,
  FileItem,
  MediaItem,
} from '@/lib/userProfile/profileModalTypes';
import {
  extensionFromMime,
  extractLinks,
  mapBeaconPreview,
  mapFiles,
  mapFilesFromRow,
  mapMedia,
  mapMediaFromRow,
  mergeBeaconItems,
  mergeFileItems,
  mergeLinkItems,
  mergeMediaItems,
  sanitizeDownloadName,
  triggerBlobDownload,
} from '@/lib/userProfile/profileMediaItems';
import type { LinkItem } from '@/lib/userProfile/profileModalTypes';

/**
 * Data layer for the profile modal's Media / Links / Files / Beacons tabs:
 * BFF fetches, E2EE key unlock, item merging, media URL resolution, and the
 * open/download actions. Extracted verbatim from UserProfileModal.
 */
export function useProfileTabsData({
  getAuthHeaders,
  currentUserId,
  requestedUserId,
  chatId,
  groupId,
  effectiveConnectionId,
  connectionUserIds,
  decryptedMessages,
}: {
  getAuthHeaders: () => Promise<HeadersInit>;
  currentUserId: string | null;
  requestedUserId: string | null;
  chatId: string | null;
  groupId: string | null;
  effectiveConnectionId: string | null;
  connectionUserIds: string[];
  decryptedMessages: DecryptedProfileMessage[];
}) {
  const [derivedKeys, setDerivedKeys] = useState<DerivedKeys | null>(null);
  const [groupMasterKey, setGroupMasterKey] = useState<ArrayBuffer | null>(null);
  const [cryptoUnlockError, setCryptoUnlockError] = useState<string | null>(null);
  const [resolvedMediaUrls, setResolvedMediaUrls] = useState<Record<string, string>>({});
  const [signedFileUrls, setSignedFileUrls] = useState<Record<string, string>>({});
  const [fallbackLinkItems, setFallbackLinkItems] = useState<LinkItem[]>([]);

  const tabsPath = (() => {
    const paramId = (chatId?.trim() || effectiveConnectionId || groupId?.trim() || '').trim();
    if (!paramId) return null;
    const base = `/api/connections/${encodeURIComponent(paramId)}/tabs?limit=200`;
    const explicitChat = chatId?.trim();
    if (explicitChat && explicitChat !== paramId) {
      return `${base}&chatId=${encodeURIComponent(explicitChat)}`;
    }
    if (explicitChat) {
      return `${base}&chatId=${encodeURIComponent(explicitChat)}`;
    }
    return base;
  })();
  const { data: tabsPayload, isLoading: tabsLoading } = useSWR<ConnectionTabsPayload>(
    tabsPath,
    async (path: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(path, { headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          authFailureMessage(
            res.status,
            typeof json?.error === 'string' && json.error.trim()
              ? json.error
              : res.statusText || 'Failed to load profile tabs',
          ),
        );
      }
      return json as ConnectionTabsPayload;
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: false,
    },
  );

  const chatMessagesPath = tabsPayload?.chatId
    ? `/api/chat/messages?chatId=${encodeURIComponent(tabsPayload.chatId)}&limit=200`
    : null;
  const { data: chatMessagesPayload, isLoading: chatMessagesLoading } = useSWR<ChatMessagesPayload>(
    chatMessagesPath,
    async (path: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(path, { headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' && json.error.trim()
            ? json.error
            : res.statusText || 'Failed to load chat messages',
        );
      }
      return json as ChatMessagesPayload;
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: false,
    },
  );

  const connectionUserIdsKey = connectionUserIds.join(':');

  useEffect(() => {
    let cancelled = false;
    setDerivedKeys(null);
    setGroupMasterKey(null);
    setCryptoUnlockError(null);

    const gid = groupId?.trim();
    if (gid && currentUserId) {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setCryptoUnlockError('Could not unlock group encryption for this device.');
        return;
      }
      void unwrapGroupMasterKeyBytes(supabase, {
        groupId: gid,
        viewerUserId: currentUserId,
      })
        .then((master) => {
          if (cancelled) return;
          if (master) {
            setGroupMasterKey(master);
          } else {
            setCryptoUnlockError('Could not unlock group encryption for this device.');
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCryptoUnlockError('Could not unlock group encryption for this device.');
          }
        });
      return () => {
        cancelled = true;
      };
    }

    if (!effectiveConnectionId || connectionUserIds.length < 2) return;

    void deriveKeysForConnection(effectiveConnectionId, connectionUserIds)
      .then((keys) => {
        if (!cancelled) setDerivedKeys(keys);
      })
      .catch(() => {
        if (!cancelled) {
          setDerivedKeys(null);
          setCryptoUnlockError('Could not derive chat keys for media decryption.');
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveConnectionId, connectionUserIdsKey, groupId, currentUserId]);

  const mediaChatKey: SecureMediaChatKey | null = groupMasterKey ?? derivedKeys;

  const localMediaItems = useMemo(() => {
    return decryptedMessages
      .map((m) =>
        mapMediaFromRow({
          id: m.id,
          content: m.content,
          message_type: coerceMessageType(m.messageType),
          metadata: m.metadata ?? null,
        }),
      )
      .filter((row): row is MediaItem => row != null);
  }, [decryptedMessages]);

  const bffMediaItems = useMemo(() => mapMedia(tabsPayload?.media ?? []), [tabsPayload]);
  const mediaItems = useMemo(
    () => mergeMediaItems(localMediaItems, bffMediaItems),
    [localMediaItems, bffMediaItems],
  );
  const imageItems = useMemo(() => mediaItems.filter((m) => m.mediaType === 'image'), [mediaItems]);
  const audioItems = useMemo(() => mediaItems.filter((m) => m.mediaType === 'audio'), [mediaItems]);

  const localFileItems = useMemo(() => {
    const fileMessages = decryptedMessages.filter(
      (m) =>
        coerceMessageType(m.messageType) === 'file' ||
        (m.metadata != null &&
          (typeof m.metadata['attachment_v'] === 'number' ||
            typeof m.metadata['attachment_v'] === 'string' ||
            typeof m.metadata['attachment_path'] === 'string' ||
            typeof m.metadata['attachment_name'] === 'string' ||
            typeof m.metadata['file_name'] === 'string' ||
            typeof m.metadata['filename'] === 'string')),
    );
    return fileMessages.map((m): FileItem =>
      mapFilesFromRow({
        id: m.id,
        content: m.content,
        message_type: coerceMessageType(m.messageType),
        metadata: m.metadata ?? null,
        time_created: m.timestamp,
      }),
    );
  }, [decryptedMessages]);
  const bffFileItems = useMemo(() => mapFiles(tabsPayload?.files ?? []), [tabsPayload]);
  const fileItems = useMemo(
    () => mergeFileItems(localFileItems, bffFileItems),
    [localFileItems, bffFileItems],
  );

  const localBeaconItems = useMemo(() => {
    return decryptedMessages
      .filter((m) => coerceMessageType(m.messageType) === 'beacon')
      .map((m) =>
        mapBeaconPreview({
          id: m.id,
          content: m.content,
          message_type: coerceMessageType(m.messageType),
          metadata: m.metadata ?? null,
        }),
      )
      .filter((row): row is BeaconPreviewItem => row != null);
  }, [decryptedMessages]);

  const bffBeaconItems = useMemo(() => {
    return (tabsPayload?.beacons ?? [])
      .map((row) =>
        mapBeaconPreview({
          id: row.id,
          content: row.content,
          message_type: row.message_type,
          metadata: row.metadata,
        }),
      )
      .filter((row): row is BeaconPreviewItem => row != null);
  }, [tabsPayload]);

  const beaconItems = useMemo(
    () => mergeBeaconItems(localBeaconItems, bffBeaconItems),
    [localBeaconItems, bffBeaconItems],
  );

  const recommendationPath = effectiveConnectionId
    ? `/api/connections/${encodeURIComponent(effectiveConnectionId)}/event-recommendation`
    : null;
  const { data: recommendationPayload } = useSWR<EventRecommendationPayload>(
    recommendationPath,
    async (path: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(path, { headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' && json.error.trim()
            ? json.error
            : res.statusText || 'Failed to load recommendation',
        );
      }
      return json as EventRecommendationPayload;
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: false,
    },
  );

  const mediaItemsFingerprint = useMemo(
    () => mediaItems.map((item) => `${item.id}:${item.sourceUrl ?? ""}:${item.storagePath ?? ""}`).join("|"),
    [mediaItems],
  );

  useEffect(() => {
    if (!requestedUserId) return;

    let cancelled = false;
    const objectUrls: string[] = [];

    if (mediaItems.length === 0) {
      setResolvedMediaUrls((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    const resolveAll = async () => {
      const next: Record<string, string> = {};
      for (const item of mediaItems) {
        try {
          let sourceUrl = item.sourceUrl;
          if (!sourceUrl && item.storagePath) {
            sourceUrl = await signChatAttachmentUrl(item.storagePath, getAuthHeaders);
          }
          if (!sourceUrl) continue;

          if (item.isEncrypted) {
            if (!mediaChatKey) {
              if (!cancelled) {
                setCryptoUnlockError((prev) =>
                  prev ?? 'Encrypted media could not be unlocked for this profile.',
                );
              }
              continue;
            }
            const objectUrl = await createSecureMediaObjectUrl({
              storageUrl: sourceUrl,
              chatKey: mediaChatKey,
              mimeType: item.mimeType ?? undefined,
            });
            objectUrls.push(objectUrl);
            next[item.id] = objectUrl;
          } else {
            next[item.id] = sourceUrl;
          }
        } catch {
          // Keep this media tile hidden when we cannot resolve/decrypt its source.
        }
      }
      if (!cancelled) setResolvedMediaUrls(next);
    };

    void resolveAll();
    return () => {
      cancelled = true;
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mediaItemsFingerprint is the identity key
  }, [requestedUserId, mediaChatKey, getAuthHeaders, mediaItemsFingerprint]);

  const localLinkItems = useMemo(
    () =>
      extractLinks(
        decryptedMessages.filter(
          (m) =>
            coerceMessageType(m.messageType) === 'text' &&
            (m.content.includes('http://') || m.content.includes('https://')),
        ),
      ),
    [decryptedMessages],
  );

  useEffect(() => {
    let cancelled = false;

    const sourceRows = chatMessagesPayload?.messages ?? [];
    if (sourceRows.length === 0) {
      setFallbackLinkItems([]);
      return;
    }

    const hydrate = async () => {
      const decryptedRows: DecryptedProfileMessage[] = [];
      for (const row of sourceRows) {
        if (coerceMessageType(row.message_type) !== 'text') continue;

        let content = row.content;
        if (isGroupMessageEncrypted(content) && groupMasterKey) {
          content = await decryptGroupMessageContent(content, groupMasterKey);
        } else if (isEncrypted(content) && derivedKeys) {
          content = await decryptContent(content, derivedKeys);
        }

        decryptedRows.push({
          id: row.id,
          content,
          timestamp: new Date(row.time_created).toISOString(),
          messageType: row.message_type,
          metadata: row.metadata,
        });
      }

      if (!cancelled) {
        setFallbackLinkItems(extractLinks(decryptedRows));
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [chatMessagesPayload?.messages, derivedKeys, groupMasterKey, localLinkItems.length]);

  const linkItems = useMemo(
    () => mergeLinkItems(localLinkItems, fallbackLinkItems),
    [localLinkItems, fallbackLinkItems],
  );

  const downloadUrl = useCallback(async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objUrl;
      anchor.download = sanitizeDownloadName(filename);
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objUrl);
      return;
    } catch {
      // Fallback: trigger a direct navigation/download via anchor (popup-safe).
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = sanitizeDownloadName(filename);
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
  }, []);

  const openMediaItem = useCallback(
    (item: MediaItem) => {
      const url = resolvedMediaUrls[item.id];
      if (!url) return;
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [resolvedMediaUrls],
  );

  const downloadMediaItem = useCallback(
    async (item: MediaItem) => {
      const url = resolvedMediaUrls[item.id];
      if (!url) return;
      const ext = extensionFromMime(item.mimeType);
      await downloadUrl(url, `${item.mediaType}-${item.id}.${ext}`);
    },
    [downloadUrl, resolvedMediaUrls],
  );

  const resolveFileUrl = useCallback(
    async (item: FileItem): Promise<string | null> => {
      if (item.downloadUrl) return item.downloadUrl;
      const cached = signedFileUrls[item.id];
      if (cached) return cached;
      if (!item.storagePath) return null;
      try {
        const signed = await signChatAttachmentUrl(item.storagePath, getAuthHeaders);
        setSignedFileUrls((prev) => ({ ...prev, [item.id]: signed }));
        return signed;
      } catch {
        return null;
      }
    },
    [getAuthHeaders, signedFileUrls],
  );

  const openFileItem = useCallback(
    async (item: FileItem) => {
      const popup = window.open('', '_blank', 'noopener,noreferrer');
      const url = await resolveFileUrl(item);
      if (!url) {
        popup?.close();
        return;
      }
      if (popup) {
        popup.location.href = url;
      } else {
        window.location.assign(url);
      }
    },
    [resolveFileUrl],
  );

  const downloadFileItem = useCallback(
    async (item: FileItem) => {
      const url = await resolveFileUrl(item);
      if (!url) return;
      if (item.envelope) {
        try {
          const ciphertext = await downloadAttachmentCiphertext(url);
          const fileKey = decodeFileMasterKeyBase64(item.envelope.key);
          const plaintext = await decryptFileBytes(ciphertext, fileKey);
          const digest = await sha256Base64(plaintext);
          if (digest !== item.envelope.sha256) {
            throw new Error('Attachment integrity check failed (SHA-256 mismatch)');
          }
          triggerBlobDownload(plaintext, item.fileName, item.mimeType);
          return;
        } catch {
          // If decryption fails, fall back to raw download path for legacy/non-envelope rows.
        }
      }
      await downloadUrl(url, item.fileName);
    },
    [downloadUrl, resolveFileUrl],
  );

  useEffect(() => {
    // Reset hook-owned derived state whenever the sheet opens for a new user.
    if (!requestedUserId) return;
    setResolvedMediaUrls({});
    setSignedFileUrls({});
    setFallbackLinkItems([]);
  }, [requestedUserId]);

  return {
    tabsLoading,
    chatMessagesLoading,
    cryptoUnlockError,
    mediaItems,
    imageItems,
    audioItems,
    fileItems,
    beaconItems,
    linkItems,
    resolvedMediaUrls,
    recommendationPayload,
    openMediaItem,
    downloadMediaItem,
    openFileItem,
    downloadFileItem,
  };
}
