import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          0: "#0a0a0b",
          1: "#111114",
          2: "#16161a",
          3: "#1d1d23",
          4: "#26262e",
        },
        ink: {
          0: "#f5f5f7",
          1: "#c8c8cf",
          2: "#9a9aa3",
          3: "#6c6c75",
          4: "#3f3f47",
        },
        accent: {
          DEFAULT: "#1f7a8c",
          fg: "#e6f6fb",
          muted: "#143b46",
        },
        ai: "#7e57c2",
        success: "#4ade80",
        warn: "#fbbf24",
        danger: "#f87171",
        info: "#60a5fa",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["10px", "14px"],
        xs: ["11px", "16px"],
        sm: ["12px", "18px"],
        base: ["13px", "20px"],
        md: ["14px", "22px"],
      },
    },
  },
  plugins: [],
};

export default config;
