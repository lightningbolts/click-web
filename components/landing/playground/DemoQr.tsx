'use client';

import { QRCodeSVG } from 'qrcode.react';
import { DEMO_QR_URL, DEMO_USER_NAME } from './mockData';

/** Matches logged-in `QRIdentityCard`: dark modules on #121212, brand purple, center wordmark. */
export default function DemoQr({ size = 200 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <QRCodeSVG
        value={DEMO_QR_URL}
        size={size}
        level="M"
        bgColor="#121212"
        fgColor="#630ed4"
        marginSize={0}
        title={`Click QR Code for ${DEMO_USER_NAME}`}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="rounded-lg bg-[#121212] px-2 py-1">
          <span className="text-sm font-bold tracking-wide text-white" style={{ fontSize: size >= 180 ? 18 : 12 }}>
            Click
          </span>
        </div>
      </div>
    </div>
  );
}
