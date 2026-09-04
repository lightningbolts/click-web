import { z } from 'zod';
import {
  isRecord,
  nonEmptyString,
  optionalNonEmptyString,
  pickDualString,
  withDualId,
} from '@/lib/api/schemas/common';

const strictE2eeIdentifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const positiveEpoch = z.number().int().positive().max(2147483647);

function canonicalEpochBody(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const {
    chat_id: snakeChatId,
    chatId,
    sender_device_id: snakeSenderDeviceId,
    senderDeviceId,
    membership_fingerprint: snakeFingerprint,
    membershipFingerprint,
    ...rest
  } = raw;
  return {
    ...rest,
    chat_id: typeof snakeChatId === 'string' ? snakeChatId : typeof chatId === 'string' ? chatId : snakeChatId ?? chatId,
    sender_device_id:
      typeof snakeSenderDeviceId === 'string'
        ? snakeSenderDeviceId
        : typeof senderDeviceId === 'string'
          ? senderDeviceId
          : snakeSenderDeviceId ?? senderDeviceId,
    membership_fingerprint:
      typeof snakeFingerprint === 'string'
        ? snakeFingerprint
        : typeof membershipFingerprint === 'string'
          ? membershipFingerprint
          : snakeFingerprint ?? membershipFingerprint,
  };
}

function canonicalEnvelope(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const {
    recipient_device_id: snakeRecipient,
    recipientDeviceId,
    ...rest
  } = raw;
  return {
    ...rest,
    recipient_device_id:
      typeof snakeRecipient === 'string'
        ? snakeRecipient
        : typeof recipientDeviceId === 'string'
          ? recipientDeviceId
          : snakeRecipient ?? recipientDeviceId,
  };
}

export const chatMessagePostBodySchema = z.preprocess((raw) => {
  if (!isRecord(raw)) return raw;
  const chat_id = pickDualString(raw, 'chat_id', 'chatId');
  const connection_id = pickDualString(raw, 'connection_id', 'connectionId');
  return { ...raw, chat_id, connection_id };
}, z.object({
  chat_id: optionalNonEmptyString,
  connection_id: optionalNonEmptyString,
  content: z.unknown().optional(),
  metadata: z.unknown().optional(),
  epoch: z.unknown().optional(),
  sender_device_id: z.unknown().optional(),
  client_message_id: z.unknown().optional(),
  message_type: z.unknown().optional(),
}).passthrough());

export const chatMessagePatchBodySchema = z.preprocess((raw) => {
  if (!isRecord(raw)) return raw;
  const chat_id = pickDualString(raw, 'chat_id', 'chatId');
  const messageId =
    pickDualString(raw, 'message_id', 'messageId') ??
    (typeof raw.messageId === 'string' ? raw.messageId.trim() : undefined);
  return { ...raw, chat_id, messageId };
}, z.object({
  messageId: nonEmptyString,
  chat_id: optionalNonEmptyString,
  content: z.unknown().optional(),
  metadata: z.unknown().optional(),
  epoch: z.unknown().optional(),
  sender_device_id: z.unknown().optional(),
  client_message_id: z.unknown().optional(),
}).passthrough());

export const chatEpochLifecycleBodySchema = z.preprocess(
  canonicalEpochBody,
  z.object({
    chat_id: nonEmptyString,
    epoch: positiveEpoch,
    sender_device_id: strictE2eeIdentifier,
    membership_fingerprint: strictE2eeIdentifier,
    envelopes: z.array(
      z.preprocess(
        canonicalEnvelope,
        z.object({
          recipient_device_id: strictE2eeIdentifier,
          envelope: z.string().min(16).max(16384),
        }).strict(),
      ),
    ).min(1).max(1024),
  }).strict(),
);

function canonicalKeyTransferBody(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const {
    chat_id: snakeChatId,
    chatId,
    approving_device_id: snakeApprover,
    approvingDeviceId,
    recipient_device_id: snakeRecipient,
    recipientDeviceId,
    ...rest
  } = raw;
  return {
    ...rest,
    chat_id: typeof snakeChatId === 'string' ? snakeChatId : typeof chatId === 'string' ? chatId : snakeChatId ?? chatId,
    approving_device_id:
      typeof snakeApprover === 'string'
        ? snakeApprover
        : typeof approvingDeviceId === 'string'
          ? approvingDeviceId
          : snakeApprover ?? approvingDeviceId,
    recipient_device_id:
      typeof snakeRecipient === 'string'
        ? snakeRecipient
        : typeof recipientDeviceId === 'string'
          ? recipientDeviceId
          : snakeRecipient ?? recipientDeviceId,
  };
}

export const chatKeyTransferApprovalBodySchema = z.preprocess(
  canonicalKeyTransferBody,
  z.object({
    chat_id: nonEmptyString,
    approving_device_id: strictE2eeIdentifier,
    recipient_device_id: strictE2eeIdentifier,
    historical_envelopes: z.array(
      z.object({
        epoch: positiveEpoch,
        recipient_device_id: strictE2eeIdentifier,
        sender_device_id: strictE2eeIdentifier,
        envelope: z.string().min(16).max(16384),
      }).strict(),
    ).min(1).max(1024),
  }).strict(),
);

export const chatIdBodySchema = z.preprocess(
  withDualId('chat_id', 'chatId'),
  z.object({
    chat_id: nonEmptyString,
  }),
);

export const chatDeliveredBodySchema = z.preprocess((raw) => {
  if (!isRecord(raw)) return raw;
  const chat_id = pickDualString(raw, 'chat_id', 'chatId');
  const message_ids = Array.isArray(raw.message_ids)
    ? raw.message_ids
    : Array.isArray(raw.messageIds)
      ? raw.messageIds
      : undefined;
  return { ...raw, chat_id, message_ids };
}, z.object({
  chat_id: nonEmptyString,
  message_ids: z.array(z.string()).optional(),
}).passthrough());

export const chatReactionBodySchema = z.object({
  messageId: nonEmptyString,
  reactionType: nonEmptyString,
}).passthrough();

export const chatAttachmentSignBodySchema = z.object({
  path: nonEmptyString,
});

export const chatAttachmentBodySchema = z.preprocess(
  withDualId('chat_id', 'chatId'),
  z.object({
    chat_id: nonEmptyString,
    file_b64: nonEmptyString,
    file_name: optionalNonEmptyString,
    mime_type: optionalNonEmptyString,
  }).passthrough(),
);

export const chatMediaBodySchema = z.preprocess(
  withDualId('chat_id', 'chatId'),
  z.object({
    chat_id: nonEmptyString,
    file_b64: nonEmptyString,
    mime_type: optionalNonEmptyString,
  }).passthrough(),
);

export const livekitTokenBodySchema = z.object({
  connection_id: optionalNonEmptyString,
  group_id: optionalNonEmptyString,
  room_name: optionalNonEmptyString,
  participant_name: optionalNonEmptyString,
}).passthrough();
