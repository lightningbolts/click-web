/**
 * @jest-environment node
 */

import { z } from 'zod';
import { parseBody } from '@/lib/api/parseBody';

describe('parseBody', () => {
  const schema = z.object({
    email: z.string().email(),
  });

  it('returns data for a valid body', async () => {
    const req = new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com' }),
    });
    const result = await parseBody(req, schema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.email).toBe('a@b.com');
  });

  it('returns a validation error envelope for invalid bodies', async () => {
    const req = new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    const result = await parseBody(req, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const json = await result.response.json();
      expect(result.response.status).toBe(400);
      expect(json.code).toBe('validation_error');
      expect(typeof json.error).toBe('string');
    }
  });
});
