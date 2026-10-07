import { act, render } from '@testing-library/react';

jest.mock('@/lib/dashboard/diskCache', () => ({
  readDiskSnapshot: jest.fn(),
  writeDiskSnapshot: jest.fn(),
  clearDiskSnapshots: jest.fn(),
}));

import { clearDiskSnapshots, readDiskSnapshot, writeDiskSnapshot } from '@/lib/dashboard/diskCache';
import { clearSessionCache, readSessionCache, useSessionCacheHydrated, writeSessionCache } from '@/lib/dashboard/sessionCache';

const read = readDiskSnapshot as jest.Mock;
const write = writeDiskSnapshot as jest.Mock;

function Gate({ userId, seen }: { userId: string; seen: boolean[] }) {
  seen.push(useSessionCacheHydrated(userId));
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
  read.mockReset();
  write.mockReset();
});
afterEach(() => {
  clearSessionCache();
  jest.useRealTimers();
});

describe('session cache across reloads', () => {
  it('holds screens until the disk snapshot is in memory; memory wins over disk', async () => {
    writeSessionCache('u1', 'connectionsLoaded', false);
    read.mockResolvedValue({ connections: [{ id: 'c1' }], connectionsLoaded: true, notPersisted: 1 });
    const seen: boolean[] = [];
    render(<Gate userId="u1" seen={seen} />);
    expect(seen).toEqual([false]);
    await act(async () => {});
    expect(seen.at(-1)).toBe(true);
    expect(readSessionCache('u1', 'connections')).toEqual([{ id: 'c1' }]);
    expect(readSessionCache('u1', 'connectionsLoaded')).toBe(false);
    expect(readSessionCache('u1', 'notPersisted')).toBeUndefined();

    // Already hydrated: the next screen renders at once, without another read.
    const again: boolean[] = [];
    render(<Gate userId="u1" seen={again} />);
    expect(again[0]).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('writes persisted keys through, debounced, only after hydration', async () => {
    read.mockResolvedValue(null);
    writeSessionCache('u1', 'chatMetadata', { c1: { preview: 'hi' } });
    jest.runAllTimers();
    expect(write).not.toHaveBeenCalled();

    render(<Gate userId="u1" seen={[]} />);
    await act(async () => {});
    writeSessionCache('u1', 'chatMetadata', { c1: { preview: 'hey' } });
    writeSessionCache('u1', 'birthdayPresent', true);
    writeSessionCache('u1', 'coreIds', new Set(['c1']));
    jest.runAllTimers();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('u1', { chatMetadata: { c1: { preview: 'hey' } }, coreIds: new Set(['c1']) });
  });

  it('sign-out drops pending writes and the disk snapshot', async () => {
    read.mockResolvedValue(null);
    render(<Gate userId="u1" seen={[]} />);
    await act(async () => {});
    writeSessionCache('u1', 'connections', []);
    clearSessionCache();
    jest.runAllTimers();
    expect(write).not.toHaveBeenCalled();
    expect(clearDiskSnapshots).toHaveBeenCalled();
  });
});
