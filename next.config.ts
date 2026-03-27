import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Multiple lockfiles (e.g. a parent package-lock.json) make Next infer the wrong root; dev then fails to resolve `tailwindcss` from this app.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
