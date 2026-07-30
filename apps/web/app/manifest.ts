import type { MetadataRoute } from "next";
import { COMPANY, METADATA } from "@/lib/content";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: METADATA.titleDefault,
    short_name: COMPANY.name,
    description: METADATA.description,
    start_url: "/",
    display: "standalone",
    // Matches --background in the dark theme, so an installed shell and the
    // splash screen don't flash white before the page paints.
    background_color: "#121215",
    theme_color: "#121215",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
