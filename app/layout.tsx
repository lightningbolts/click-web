import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { SiteChrome } from "@/components/app-shell/SiteChrome";
import { ShellProvider } from "@/components/app-shell/ShellContext";
import Footer from "@/components/Footer";
import { AppToaster } from "@/components/ds/Toast";
import { TooltipProvider } from "@/components/ds/Tooltip";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { THEME_BOOT_SCRIPT, THEME_COLOR } from "@/lib/theme/themeBoot";
import { ProductChromeProvider } from "@/lib/shell/ProductChromeContext";
import CloudflareAnalytics from "@/components/CloudflareAnalytics";
import { publicOrigin } from "@/lib/events/eventUrls";
import { brandShareImage } from "@/lib/brand/shareImage";

/**
 * Manrope is the display face only (titles, 700–800). Body text uses the system
 * stack (spec §4.2, D2), so this is the only font request on any page.
 * Self-hosted (Fontsource, OFL) so builds never fetch Google Fonts: in Workers
 * Builds, next/font/google failed with "queries have exactly one entry".
 */
const manrope = localFont({
  src: [
    { path: "./fonts/manrope-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/manrope-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin()),
  title: "Click - From Handshake to Friendship",
  description:
    "Stop collecting followers. Start building real connections. Click transforms fleeting in-person moments into lasting friendships.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
      { url: "/brand/logo-icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Click - From Handshake to Friendship",
    description:
      "Stop collecting followers. Start building real connections. Click transforms fleeting in-person moments into lasting friendships.",
    images: [brandShareImage()],
  },
  twitter: {
    card: "summary_large_image",
    images: [brandShareImage().url],
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

/**
 * The root layout never reads cookies: marketing and public pages render static,
 * and signed-in routes seed auth from their own server read (see `AuthSeed`).
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content={THEME_COLOR.light} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-bg font-sans text-fg antialiased">
        <ThemeProvider>
          <AuthProvider>
            <ProductChromeProvider>
              <TooltipProvider>
                <ShellProvider>
                  <SiteChrome />
                  <main className="flex flex-1 flex-col">{children}</main>
                  <Footer />
                  <AppToaster />
                </ShellProvider>
              </TooltipProvider>
            </ProductChromeProvider>
          </AuthProvider>
        </ThemeProvider>
        <CloudflareAnalytics />
      </body>
    </html>
  );
}
