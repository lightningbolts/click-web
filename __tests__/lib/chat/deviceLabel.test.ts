import { browserDeviceLabel, isBrowserDeviceLabel, isMobileAppDeviceLabel, newSignInSubject } from '@/lib/chat/deviceLabel';

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
};

describe('browserDeviceLabel', () => {
  it('names the browser and the system, never the device', () => {
    expect(browserDeviceLabel(UA.chromeMac)).toBe('Chrome on Mac');
    expect(browserDeviceLabel(UA.safariMac)).toBe('Safari on Mac');
    expect(browserDeviceLabel(UA.edgeWin)).toBe('Edge on Windows');
    expect(browserDeviceLabel(UA.firefoxLinux)).toBe('Firefox on Linux');
    expect(browserDeviceLabel(UA.safariIphone)).toBe('Safari on iPhone');
    expect(browserDeviceLabel(UA.chromeAndroid)).toBe('Chrome on Android');
  });

  it('tells iPadOS (which reports a Mac) apart by touch', () => {
    expect(browserDeviceLabel(UA.safariMac, 5)).toBe('Safari on iPad');
  });

  it('returns null for an unknown agent', () => {
    expect(browserDeviceLabel('curl/8.0')).toBeNull();
  });
});

describe('device label kinds', () => {
  it('separates browsers from the apps', () => {
    expect(isBrowserDeviceLabel('Chrome on Mac')).toBe(true);
    expect(isBrowserDeviceLabel('Web browser')).toBe(true);
    expect(isBrowserDeviceLabel('iPhone')).toBe(false);
    expect(isMobileAppDeviceLabel('iPhone')).toBe(true);
    expect(isMobileAppDeviceLabel('Safari on iPhone')).toBe(false);
    expect(isMobileAppDeviceLabel(null)).toBe(false);
  });

  it('reads naturally as a sentence subject', () => {
    expect(newSignInSubject('iPhone')).toBe('A new iPhone');
    expect(newSignInSubject('Chrome on Mac')).toBe('Chrome on Mac');
    expect(newSignInSubject('Web browser')).toBe('A new web browser');
    expect(newSignInSubject(null)).toBe('A new device');
  });
});
