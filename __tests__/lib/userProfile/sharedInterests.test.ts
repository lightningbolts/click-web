import { describe, expect, it } from '@jest/globals';
import { getSharedInterestTags } from '@/lib/userProfile/sharedInterests';

describe('getSharedInterestTags', () => {
  it('returns intersection case-insensitively with viewer casing preserved', () => {
    expect(
      getSharedInterestTags(['Coffee', 'Hiking'], ['hiking', 'music']),
    ).toEqual(['Hiking']);
  });

  it('returns empty when either side is empty', () => {
    expect(getSharedInterestTags([], ['a'])).toEqual([]);
    expect(getSharedInterestTags(['a'], [])).toEqual([]);
  });

  it('dedupes viewer duplicates', () => {
    expect(getSharedInterestTags(['Run', 'run'], ['Run'])).toEqual(['Run']);
  });
});
