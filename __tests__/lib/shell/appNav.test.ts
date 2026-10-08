import { activeAppSection } from '@/lib/shell/appNav';

describe('activeAppSection', () => {
  it.each([
    ['/', 'home'],
    ['/events', 'events'],
    ['/e/abc/pass', 'events'],
    ['/me', 'me'],
    ['/tickets', 'me'],
    ['/tickets?scope=past', 'me'],
    ['/settings/account', 'me'],
    ['/ticketsfoo', null],
  ])('%s → %s', (path, section) => {
    expect(activeAppSection(path)).toBe(section);
  });
});
