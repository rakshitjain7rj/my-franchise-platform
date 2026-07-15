"use client";

export default function OfflineRetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "9999px",
        border: "1px solid rgba(128, 115, 125, 0.45)",
        background: "transparent",
        color: "#4A154B",
        padding: "0.75rem 1.5rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      Retry connection
    </button>
  );
}
