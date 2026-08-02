import type { NextConfig } from "next";

// Avatars come from either Google's OAuth profile photos or this project's own Supabase
// Storage bucket — derived from env so a Supabase project change (e.g. a region migration)
// doesn't also require editing this file.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.googleusercontent.com" },
      ...(supabaseHostname ? [{ protocol: "https" as const, hostname: supabaseHostname }] : []),
    ],
  },
};

export default nextConfig;
