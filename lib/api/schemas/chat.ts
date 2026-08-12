import { z } from 'zod';
import {
  isRecord,
  nonEmptyString,
  optionalNonEmptyString,
  pickDualString,
  withDualId,
} from '@/lib/api/schemas/common';

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
}).passthrough());

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
