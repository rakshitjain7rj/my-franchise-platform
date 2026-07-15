import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        foreground: "#1a1c1c",
        border: "#dadada",
        "tertiary-fixed-dim": "#cfc1dd",
        "on-secondary-fixed-variant": "#8c0058",
        primary: "#1f1322",
        "on-error-container": "#93000a",
        "inverse-on-surface": "#f0f1f1",
        "surface-bright": "#f9f9f9",
        "surface-variant": "#e2e2e2",
        error: "#ba1a1a",
        outline: "#80737d",
        "on-surface-variant": "#4f434c",
        "outline-variant": "#d2c2cd",
        "on-primary-fixed-variant": "#514252",
        "surface-tint": "#69596b",
        "on-tertiary-container": "#9a8ea8",
        "on-primary-fixed": "#241726",
        "dark-canvas": "#1A0A1A",
        "surface-container": "#eeeeee",
        "tertiary-container": "#31283d",
        "on-background": "#1a1c1c",
        "inverse-surface": "#2f3131",
        "neon-glow": "#FF69B4",
        "on-secondary-container": "#6c0042",
        "vibrant-magenta": "#FF69B4",
        "deep-plum": "#4A154B",
        "surface-container-lowest": "#ffffff",
        "surface-container-highest": "#e2e2e2",
        "surface-container-low": "#f3f3f4",
        "lavender-bg": "#F5F0F9",
        "inverse-primary": "#d5c0d5",
        "primary-fixed-dim": "#d5c0d5",
        background: "#f9f9f9",
        "surface-container-high": "#e8e8e8",
        "secondary-container": "#fd68b3",
        "on-secondary-fixed": "#3d0024",
        "primary-fixed": "#f2dcf1",
        "on-primary-container": "#a08da0",
        "tertiary-fixed": "#ebddf9",
        "on-tertiary": "#ffffff",
        surface: "#f9f9f9",
        "on-primary": "#ffffff",
        "on-tertiary-fixed": "#20182c",
        "on-surface": "#1a1c1c",
        "on-error": "#ffffff",
        "surface-dim": "#dadada",
        "error-container": "#ffdad6",
        "on-secondary": "#ffffff",
        "on-tertiary-fixed-variant": "#4c4359",
        "secondary-fixed-dim": "#ffb0d0",
        "primary-container": "#352737",
        secondary: "#ac2471",
        tertiary: "#1c1427",
        "secondary-fixed": "#ffd8e6"
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px"
      },
      spacing: {
        "card-padding": "24px",
        unit: "4px",
        "margin-desktop": "64px",
        gutter: "32px",
        "margin-mobile": "20px"
      },
      fontFamily: {
        "headline-xl-mobile": ["Plus Jakarta Sans"],
        "body-md": ["Be Vietnam Pro"],
        "headline-md": ["Plus Jakarta Sans"],
        "headline-lg": ["Plus Jakarta Sans"],
        "headline-xl": ["Plus Jakarta Sans"],
        "body-lg": ["Be Vietnam Pro"],
        "label-bold": ["Plus Jakarta Sans"],
        "label-sm": ["Plus Jakarta Sans"],
        headline: ["Plus Jakarta Sans"],
        display: ["Plus Jakarta Sans"],
        body: ["Be Vietnam Pro"],
        label: ["Plus Jakarta Sans"]
      },
      fontSize: {
        "headline-xl-mobile": ["36px", { lineHeight: "44px", fontWeight: "700" }],
        "body-md": ["16px", { lineHeight: "26px", fontWeight: "400" }],
        "headline-md": ["28px", { lineHeight: "36px", fontWeight: "600" }],
        "headline-lg": ["36px", { lineHeight: "44px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-xl": ["56px", { lineHeight: "64px", letterSpacing: "-0.03em", fontWeight: "800" }],
        "body-lg": ["18px", { lineHeight: "30px", fontWeight: "300" }],
        "label-bold": ["14px", { lineHeight: "20px", fontWeight: "600" }],
        "label-sm": ["12px", { lineHeight: "16px", fontWeight: "500" }]
      }
    }
  },
  plugins: []
};

export default config;
