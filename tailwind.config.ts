import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Actual MBTA line colors — the real visual language riders already know.
        mbta: {
          red: "#DA291C",
          orange: "#ED8B00",
          blue: "#003DA5",
          green: "#00843D",
          silver: "#7C878E",
          bg: "#0B0C0E", // platform-at-night black, not a generic dark theme
          panel: "#151719",
          ink: "#F4F5F6",
          dim: "#9AA0A6",
        },
      },
      fontFamily: {
        display: ["Helvetica Neue", "Arial", "sans-serif"], // MBTA signage uses Helvetica — kept deliberately
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"], // for arrival countdowns, like a real station board
      },
    },
  },
  plugins: [],
};
export default config;
