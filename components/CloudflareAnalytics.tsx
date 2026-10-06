import Script from "next/script";

/**
 * Cloudflare Web Analytics: one cookieless beacon, no npm package (spec §11.2, D11).
 * Renders nothing until NEXT_PUBLIC_CF_ANALYTICS_TOKEN is set for the deployment.
 */
export default function CloudflareAnalytics() {
  const token = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN;
  if (!token) return null;
  return (
    <Script
      defer
      strategy="afterInteractive"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token })}
    />
  );
}
