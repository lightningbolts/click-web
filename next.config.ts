import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), interest-cohort=()' },
  {
    // Report-only first: the dashboard relies on optional Supabase, LiveKit,
    // Stripe, and map origins. Enforce this policy after report collection.
    key: 'Content-Security-Policy-Report-Only',
    value:
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; worker-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; " +
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.tiles.mapbox.com https://*.cartocdn.com https://api.klipy.com;",
  },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // OpenNext on Workers needs an IMAGES binding (Cloudflare Images) for /_next/image.
  // Without it, optimized URLs 404; serve public assets as-is on the free plan.
  images: {
    // Supabase Storage transforms; see lib/images/cfLoader.ts (spec §11.6).
    loader: 'custom',
    loaderFile: './lib/images/cfLoader.ts',
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/**' },
      { protocol: 'http', hostname: '127.0.0.1', port: '54321', pathname: '/storage/v1/**' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: "/.well-known/apple-app-site-association",
        headers: [
          {
            key: "Content-Type",
            value: "application/json",
          },
        ],
      },
    ];
  },
  // Multiple lockfiles (e.g. a parent package-lock.json) make Next infer the wrong root; dev then fails to resolve `tailwindcss` from this app.
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
    // Larger multipart bodies for chat/hub media when a proxy/middleware path buffers the request (see Next docs).
    proxyClientMaxBodySize: '32mb',
  },
};

export default nextConfig;
