import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ServiceWorkerRegistration } from "@/app/components/ServiceWorkerRegistration";
import { ToastProvider } from "@/app/components/ui/Toast";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

const title = "Vici Sensei — Kanji Spaced Repetition";
const description =
  "Learn Japanese kanji, readings, and vocabulary organized by JLPT level, scheduled with spaced repetition for exactly when your brain needs to see them again.";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.vici-sensei.com"),
  title,
  description,
  openGraph: {
    title,
    description,
    url: "/",
    siteName: "Vici Sensei",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f19",
  // "cover" lets fullscreen UI (e.g. CountrySelect's mobile picker) read env(safe-area-inset-*)
  // for the iPhone notch/Dynamic Island and home indicator -- without it those resolve to 0.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      translate="no"
      className={`notranslate ${plusJakartaSans.variable} antialiased`}
    >
      <head>
        {/* Kana/kanji readings break if a browser or extension auto-translates them.
            translate="no" is the HTML5 standard (Chrome, Edge, Safari respect it on <html>);
            Firefox Translations has an open bug (Mozilla #1969828) where it ignores the
            attribute on <html> and only checks <body>, hence the duplicate below. The
            notranslate class + meta tag cover Google Translate's widget/extension, which
            predates and doesn't fully trust the standard attribute. */}
        <meta name="google" content="notranslate" />
        {/* AuthProvider fires its first Supabase request as soon as it mounts — warm the
            connection (DNS + TLS) while the JS bundle is still parsing so that request
            doesn't pay for handshake setup on top of the round trip. */}
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
      </head>
      <body translate="no" className="notranslate">
        <ServiceWorkerRegistration />
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
