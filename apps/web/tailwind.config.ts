import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"]
      },
      colors: {
        ember: "#d9480f",
        pine: "#14532d",
        ocean: "#0f172a",
        mist: "#ecfeff"
      }
    }
  },
  plugins: []
} satisfies Config;
