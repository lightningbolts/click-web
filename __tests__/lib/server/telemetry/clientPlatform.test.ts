import { clientPlatform } from '@/lib/server/telemetry/clientPlatform';

const req = (value?: string) => ({ headers: new Headers(value === undefined ? {} : { 'X-Click-Platform': value }) });

describe('clientPlatform', () => {
  it('reads the X-Click-Platform header the apps send', () => {
    expect(clientPlatform(req('android'))).toBe('android');
    expect(clientPlatform(req('ios'))).toBe('ios');
    expect(clientPlatform(req('web'))).toBe('web');
  });

  it('ignores case and surrounding space', () => {
    expect(clientPlatform(req(' Android '))).toBe('android');
  });

  it('is null when the header is missing or unknown', () => {
    expect(clientPlatform(req())).toBeNull();
    expect(clientPlatform(req(''))).toBeNull();
    expect(clientPlatform(req('windows'))).toBeNull();
  });
});
