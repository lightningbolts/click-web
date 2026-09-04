import { z } from 'zod';
import { isRecord, nonEmptyString, pickDualString } from '@/lib/api/schemas/common';

export const hubE2eeIdentifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);

const positiveEpoch = z.number().int().positive().max(2147483647);

function canonicalEnvelope(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const { recipient_device_id, recipientDeviceId, ...rest } = raw;
  return {
    ...rest,
    recipient_device_id:
      typeof recipient_device_id === 'string'
        ? recipient_device_id
        : typeof recipientDeviceId === 'string'
          ? recipientDeviceId
          : recipient_device_id ?? recipientDeviceId,
  };
}

function canonicalHubEpochBody(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  return {
    ...raw,
    hub_id: pickDualString(raw, 'hub_id', 'hubId'),
    sender_device_id: pickDualString(raw, 'sender_device_id', 'senderDeviceId'),
    membership_fingerprint: pickDualString(raw, 'membership_fingerprint', 'membershipFingerprint'),
  };
}

export const hubEpochLifecycleBodySchema = z.preprocess(
  canonicalHubEpochBody,
  z.object({
    hub_id: nonEmptyString,
    epoch: positiveEpoch,
    sender_device_id: hubE2eeIdentifier,
    membership_fingerprint: hubE2eeIdentifier,
    envelopes: z.array(
      z.preprocess(
        canonicalEnvelope,
        z.object({
          recipient_device_id: hubE2eeIdentifier,
          envelope: z.string().min(16).max(16384),
        }).strict(),
      ),
    ).min(1).max(1024),
  }).strict(),
);
