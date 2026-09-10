import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vici Sensei",
    short_name: "Vici Sensei",
    description: "Spaced repetition kanji, readings, and vocabulary trainer organized by JLPT level.",
    start_url: "/",
    // "fullscreen" hides the OS status bar and navigation bar (Android's back/home buttons)
    // once installed to the home screen. display_override falls back to "standalone" on
    // browsers that don't honor "fullscreen" instead of dropping to the browser tab.
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    // Only takes effect for installed/home-screen PWAs (Android Chrome respects it; iOS
    // standalone support is inconsistent). Browser-tab users still get OrientationOverlay.
    orientation: "portrait",
    background_color: "#0b0f19",
    theme_color: "#0b0f19",
    icons: [
      {
        src: "/images/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/images/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
