import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} antialiased`}>
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
