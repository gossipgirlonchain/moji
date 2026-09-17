import type { MetadataRoute } from "next";

/** Web app manifest: "Add to Home Screen" on iOS installs moji as a standalone app with the sky icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "moji",
    short_name: "moji",
    description: "pick an emoji. pick a stock or token. launch.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#DCEEFB",
    theme_color: "#DCEEFB",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
