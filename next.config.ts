import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // OpenNext on Workers needs an IMAGES binding (Cloudflare Images) for /_next/image.
  // Without it, optimized URLs 404; serve public assets as-is on the free plan.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
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
