import { z } from 'zod';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Trimmed non-empty string (does not require UUID — matches current route leniency). */
export const nonEmptyString = z.string().trim().min(1);

export const optionalNonEmptyString = nonEmptyString.optional();

/** UUID string when the route already requires a real id. */
export const uuidString = z.string().trim().uuid();

export const optionalUuid = uuidString.optional();

/**
 * Read snake_case or camelCase string from a raw object and normalize onto `canonical`.
 * Used inside `z.preprocess` so mobile/web dual keys keep working.
 */
export function pickDualString(
  raw: Record<string, unknown>,
  snake: string,
  camel: string,
): string | undefined {
  const a = raw[snake];
  const b = raw[camel];
  const value = typeof a === 'string' ? a : typeof b === 'string' ? b : undefined;
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function pickDualNumber(
  raw: Record<string, unknown>,
  snake: string,
  camel: string,
): number | undefined {
  const a = raw[snake];
  const b = raw[camel];
  const value = typeof a === 'number' ? a : typeof b === 'number' ? b : Number(a ?? b);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Preprocess a body so either `snake` or `camel` lands on `canonical` (defaults to snake).
 * Extra keys are preserved for passthrough object schemas.
 */
export function withDualId(
  snake: string,
  camel: string,
  canonical: string = snake,
): (raw: unknown) => unknown {
  return (raw: unknown) => {
    if (!isRecord(raw)) return raw;
    const id = pickDualString(raw, snake, camel);
    if (id === undefined) return raw;
    return { ...raw, [canonical]: id };
  };
}

/** `{ connection_id }` body used by archive/hide/unarchive/core. */
export const connectionIdBodySchema = z.preprocess(
  withDualId('connection_id', 'connectionId'),
  z.object({
    connection_id: nonEmptyString,
  }),
);

/** Path param schemas */
export const connectionIdParamSchema = z.object({
  connectionId: nonEmptyString,
});

export const beaconIdParamSchema = z.object({
  beaconId: nonEmptyString,
});

export const chatIdParamSchema = z.object({
  chatId: nonEmptyString,
});

export const groupIdParamSchema = z.object({
  groupId: nonEmptyString,
});

export const userIdParamSchema = z.object({
  userId: nonEmptyString,
});

export const venueIdParamSchema = z.object({
  venueId: nonEmptyString,
});

export const hubIdParamSchema = z.object({
  id: nonEmptyString,
});

export const encounterIdParamSchema = z.object({
  encounter_id: nonEmptyString,
});

/** Loose JSON value for metadata / sensor blobs. */
export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const optionalTimezoneOffsetSchema = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  });
