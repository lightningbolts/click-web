import { WARM_TTL_MS, warmFetch, withWarmFetch } from '@/lib/swr/warmFetch';

describe('warmFetch', () => {
  it('lets the next read of a key use a fresh warmed fetch, once', async () => {
    let calls = 0;
    const fetcher = jest.fn(async (key: string): Promise<string> => `${key}#${++calls}`);
    const read = withWarmFetch(fetcher);
    warmFetch('/a', fetcher);
    warmFetch('/a', fetcher); // already under way
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(read('/a')).resolves.toBe('/a#1');
    await expect(read('/a')).resolves.toBe('/a#2');
  });

  it('never answers with a warmed read that has expired', async () => {
    const fetcher = jest.fn(async () => 'fresh');
    warmFetch('/b', async () => 'stale', Date.now() - WARM_TTL_MS - 1);
    await expect(withWarmFetch(fetcher)('/b')).resolves.toBe('fresh');
  });

  it('forgets a warmed read that failed, so opening the screen fetches again', async () => {
    warmFetch('/c', async () => Promise.reject(new Error('offline')));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(withWarmFetch(async () => 'ok')('/c')).resolves.toBe('ok');
  });
});
