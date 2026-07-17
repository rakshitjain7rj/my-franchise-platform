import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Plus_Jakarta_Sans } from "next/font/google";
import "@/styles/globals.css";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";
import { CartProvider } from "@/lib/cart/cart-context";
import WhatsAppWidget from "./components/WhatsAppWidget";
import CookieConsent from "./components/CookieConsent";
import PwaRegister from "./components/PwaRegister";
import PwaInstallPrompt from "./components/PwaInstallPrompt";
import DefaultStoreBootstrap from "@/components/default-store-bootstrap";
import BottomNav from "./components/BottomNav";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
});

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-be-vietnam",
});

export const metadata: Metadata = {
  title: "Cake Break | Haute Patisserie & Boutique Bakery",
  description:
    "Order boutique cakes, desserts, and patisserie for delivery or collection from Cake Break.",
  applicationName: "Cake Break",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cake Break",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

/** Viewport + theme color for browser chrome / installed PWA (mobile + desktop). */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4A154B" },
    { media: "(prefers-color-scheme: dark)", color: "#1A0A1A" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={cn("light", "font-sans", plusJakartaSans.variable)}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${plusJakartaSans.variable} ${beVietnamPro.variable} font-body-md text-on-surface selection:bg-vibrant-magenta selection:text-white bg-[#E2D4F0]`}
      >
        <CartProvider>
          {/* Auto-select franchise default bakery for first-time visitors only. */}
          <DefaultStoreBootstrap />
          {children}
          <BottomNav />
          <WhatsAppWidget />
          <CookieConsent />
          <PwaInstallPrompt />
          <PwaRegister />
        </CartProvider>
      </body>
    </html>
  );
}
