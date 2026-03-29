import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#080808",
        card: "#111111",
        primary: "#22c55e",
        primaryStrong: "#16a34a"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34, 197, 94, 0.2), 0 24px 80px rgba(34, 197, 94, 0.18)"
      },
      backgroundImage: {
        spotlight:
          "radial-gradient(circle at top, rgba(34, 197, 94, 0.18), transparent 36%), linear-gradient(180deg, rgba(255,255,255,0.02), transparent)"
      }
    }
  },
  plugins: []
};

export default config;
