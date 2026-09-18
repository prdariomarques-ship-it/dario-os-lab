export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // DARIUS Stitch dark palette (used across the existing UI classes).
        dark: {
          700: "#1f2937",
          800: "#111827",
          900: "#0a0a0a",
        },
      },
    },
  },
  plugins: [],
}
