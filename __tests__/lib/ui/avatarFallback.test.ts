import { avatarFallbackColor, avatarInitials, avatarPaletteIndex } from '@/lib/ui/avatarFallback';

describe('avatarPaletteIndex', () => {
  // Same fixtures as click-ios Tests/ClickTests/ClicksInboxTests.swift.
  it.each([
    ['usr_marcus', 6],
    ['3f1c2a9e-7b4d-4e21-9a0b-5c6d7e8f9012', 3],
    ['Zoë 🙂', 5],
    ['  ', 0],
    ['', 0],
  ])('%p → %p (matches iOS)', (seed, expected) => {
    expect(avatarPaletteIndex(seed)).toBe(expected);
  });

  it('returns a palette color', () => {
    expect(avatarFallbackColor('usr_marcus')).toBe('#0F766E');
    expect(avatarFallbackColor(null)).toBe('#4F46E5');
  });
});

describe('avatarInitials', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['ada', 'A'],
    ['  Mary Ann  Evans ', 'ME'],
    ['', '?'],
    ['Élodie', 'É'],
  ])('%p → %p', (name, expected) => {
    expect(avatarInitials(name)).toBe(expected);
  });
});
