import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Gushwork brand blue. Adjust the 500/600 hex if the exact brand value differs.
        gushwork: {
          50:  "#EFF4FF",
          100: "#DBE7FE",
          200: "#BFD3FE",
          400: "#60A5FA",
          500: "#2563EB",
          600: "#1D4ED8",
          700: "#1E3FA8",
        },
      },
      fontFamily: {
        sans: ["var(--font-vert)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
