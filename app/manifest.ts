import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vici Sensei",
    short_name: "Vici Sensei",
    description: "Spaced repetition kanji, readings, and vocabulary trainer organized by JLPT level.",
    start_url: "/",
    display: "standalone",
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
