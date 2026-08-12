/**
 * @jest-environment node
 */

import { z } from 'zod';
import { parseParams } from '@/lib/api/parseParams';
import {
  connectionIdBodySchema,
  pickDualString,
  withDualId,
} from '@/lib/api/schemas/common';

describe('pickDualString / withDualId', () => {
  it('prefers snake_case when both present', () => {
    const raw = { connection_id: 'a', connectionId: 'b' };
    expect(pickDualString(raw, 'connection_id', 'connectionId')).toBe('a');
  });

  it('falls back to camelCase', () => {
    expect(
      pickDualString({ connectionId: '  uuid-1  ' }, 'connection_id', 'connectionId'),
    ).toBe('uuid-1');
  });

  it('normalizes onto canonical key via preprocess', () => {
    const schema = z.preprocess(
      withDualId('chat_id', 'chatId'),
      z.object({ chat_id: z.string().min(1) }),
    );
    const result = schema.safeParse({ chatId: 'abc' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.chat_id).toBe('abc');
  });
});

describe('connectionIdBodySchema', () => {
  it('accepts connection_id', () => {
    const r = connectionIdBodySchema.safeParse({ connection_id: 'c1' });
    expect(r.success).toBe(true);
  });

  it('accepts connectionId alias', () => {
    const r = connectionIdBodySchema.safeParse({ connectionId: 'c1' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.connection_id).toBe('c1');
  });

  it('rejects missing id', () => {
    expect(connectionIdBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('parseParams', () => {
  const schema = z.object({ connectionId: z.string().min(1) });

  it('returns data for valid params', () => {
    const result = parseParams({ connectionId: 'abc' }, schema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.connectionId).toBe('abc');
  });

  it('returns validation_error for invalid params', async () => {
    const result = parseParams({ connectionId: '' }, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const json = await result.response.json();
      expect(result.response.status).toBe(400);
      expect(json.code).toBe('validation_error');
    }
  });
});
