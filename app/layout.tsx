import type { Metadata } from "next";
import { Suspense } from "react";
import { Manrope, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { Analytics } from "@vercel/analytics/next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AppToaster from "@/components/AppToaster";
import { ThemeProvider, THEME_BOOT_SCRIPT } from "@/lib/theme/ThemeProvider";
import { ProductChromeProvider } from "@/lib/shell/ProductChromeContext";
import { getServerUser } from "@/lib/server/getServerUser";
import { publicOrigin } from "@/lib/events/eventUrls";
import { brandShareImage } from "@/lib/brand/shareImage";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
  // Apply className on <body> so font-family is set directly — variable alone
  // can fall through to the browser/system sans (often Inter-like) if theme
  // resolution of var(--font-manrope) fails.
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  // Event titles only — do not compete with Manrope on landing LCP.
  preload: false,
  variable: "--font-source-serif",
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
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
  other: {
    "theme-color": "#f9f9f9",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialHasSession = Boolean(await getServerUser());

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <meta name="theme-color" content="#f9f9f9" />
      </head>
      <body
        className={`${manrope.variable} ${sourceSerif.variable} ${manrope.className} font-sans antialiased bg-background text-on-surface flex flex-col min-h-screen`}
      >
        <ThemeProvider>
          <AuthProvider>
            <ProductChromeProvider>
              <Suspense fallback={null}>
                <Navbar initialHasSession={initialHasSession} />
              </Suspense>
              <main className="flex-1 flex flex-col">{children}</main>
              <Footer />
              <AppToaster />
            </ProductChromeProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
