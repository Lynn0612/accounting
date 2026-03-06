import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#4A90E2",
          light: "#8ebbf0",
          pale: "#dbeafe",
          dark: "#3a7bc8",
          "500": "#4A90E2",
          "600": "#3a7bc8",
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
        },
        "line-green": "#06C755",
        "background-light": "#F0F4F8",
        "background-dark": "#121820",
        surface: "#FFFFFF",
        "surface-light": "#FFFFFF",
        "surface-dark": "#1E293B",
        "text-main": "#1e293b",
        "text-muted": "#718096",
        "text-secondary": "#64748b",
        "trend-up": "#ef4444",
        "trend-down": "#10b981",
        "accent-grey": "#e2e8f0",
      },
      boxShadow: {
        soft: "0 8px 24px -4px rgba(0, 0, 0, 0.04), 0 4px 12px -2px rgba(0, 0, 0, 0.02)",
        glow: "0 0 15px rgba(74, 144, 226, 0.3)",
        "nav-glow": "0 -4px 20px rgba(0,0,0,0.05)",
        float: "0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)",
        "inner-soft": "inset 0 2px 4px 0 rgba(0, 0, 0, 0.03)",
      },
      borderRadius: {
        DEFAULT: "1rem",
        lg: "2rem",
        xl: "3rem",
        "2xl": "24px",
        card: "24px",
        pill: "9999px",
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "Noto Sans", "sans-serif"],
        body: ["Noto Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;

