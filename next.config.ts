import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // No server to run Next's built-in image optimizer under a static export —
  // avatars (Google OAuth photos, Supabase Storage) are served as-is instead.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
