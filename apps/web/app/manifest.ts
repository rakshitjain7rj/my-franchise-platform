import type { MetadataRoute } from "next";

/**
 * Web App Manifest — required for installability on desktop (Chrome/Edge)
 * and mobile (Android Chrome, supported browsers).
 *
 * Served at /manifest.webmanifest by the Next.js App Router.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cake Break | Haute Patisserie & Boutique Bakery",
    short_name: "Cake Break",
    description:
      "Order boutique cakes, desserts, and patisserie for delivery or collection from Cake Break.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "browser"],
    orientation: "any",
    background_color: "#E2D4F0",
    theme_color: "#4A154B",
    categories: ["food", "shopping", "lifestyle"],
    lang: "en",
    dir: "ltr",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Browse cakes",
        short_name: "Catalogue",
        description: "Browse the Cake Break catalogue",
        url: "/cake-catalogue",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Cart",
        short_name: "Cart",
        description: "View your cart",
        url: "/cart",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
