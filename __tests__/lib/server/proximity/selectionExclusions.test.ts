import {
  applyMemberExclusions,
  excludedMemberIdsFromPayload,
} from '@/lib/server/proximity/selectionExclusions';

describe('applyMemberExclusions', () => {
  const selected = ['a', 'b', 'c', 'd'];

  it('keeps everyone when nobody removed anyone', () => {
    expect(applyMemberExclusions('a', selected, new Map())).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops someone another member removed', () => {
    expect(applyMemberExclusions('a', selected, new Map([['c', ['d']]]))).toEqual(['a', 'b', 'c']);
  });

  it('drops the remover, not the confirmer, when they removed the confirmer', () => {
    expect(applyMemberExclusions('a', selected, new Map([['b', ['a']]]))).toEqual(['a', 'c', 'd']);
  });

  it("applies the confirmer's own removals first", () => {
    const exclusions = new Map([
      ['a', ['b']],
      ['b', ['c']],
    ]);
    expect(applyMemberExclusions('a', selected, exclusions)).toEqual(['a', 'c', 'd']);
  });

  it('can leave only the confirmer', () => {
    expect(applyMemberExclusions('a', ['a', 'b'], new Map([['b', ['a']]]))).toEqual(['a']);
  });
});

describe('excludedMemberIdsFromPayload', () => {
  it('reads string ids and ignores junk', () => {
    expect(excludedMemberIdsFromPayload({ excluded_member_ids: ['x', 3, '', 'y'] })).toEqual(['x', 'y']);
    expect(excludedMemberIdsFromPayload(null)).toEqual([]);
    expect(excludedMemberIdsFromPayload({})).toEqual([]);
  });
});
