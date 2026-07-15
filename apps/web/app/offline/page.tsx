import Link from "next/link";
import OfflineRetryButton from "./OfflineRetryButton";

/**
 * Offline fallback page — precached by the service worker so it works
 * when the user has no network (desktop or mobile installed PWA).
 *
 * Critical styles are inlined so the page remains usable even if
 * Tailwind / Next chunks are not yet in the runtime cache.
 */
export const metadata = {
  title: "You're offline | Cake Break",
  description: "Reconnect to continue browsing Cake Break.",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4rem 1.5rem",
        background: "#E2D4F0",
        fontFamily:
          'var(--font-be-vietnam), "Be Vietnam Pro", system-ui, sans-serif',
        color: "#1a1c1c",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "28rem",
          borderRadius: "1.5rem",
          border: "1px solid rgba(210, 194, 205, 0.5)",
          background: "rgba(255,255,255,0.95)",
          boxShadow: "0 16px 48px rgba(74,21,75,0.12)",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            margin: "0 auto 1.25rem",
            display: "flex",
            height: "4rem",
            width: "4rem",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "1rem",
            background: "#4A154B",
            color: "#fff",
            fontSize: "1.75rem",
          }}
          aria-hidden
        >
          ⚡
        </div>

        <h1
          style={{
            margin: "0 0 0.5rem",
            fontFamily:
              'var(--font-plus-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#4A154B",
            letterSpacing: "-0.02em",
          }}
        >
          You&apos;re offline
        </h1>
        <p
          style={{
            margin: "0 0 1.5rem",
            fontSize: "0.95rem",
            lineHeight: 1.6,
            color: "#4f434c",
          }}
        >
          Cake Break needs a connection to load the latest cakes, prices, and
          store availability. Check your network and try again.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            justifyContent: "center",
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "9999px",
              background: "#4A154B",
              color: "#fff",
              padding: "0.75rem 1.5rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            Try homepage
          </Link>
          <OfflineRetryButton />
        </div>
      </div>
    </main>
  );
}
