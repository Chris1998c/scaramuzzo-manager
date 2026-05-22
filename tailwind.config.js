/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.2rem",
      screens: {
        sm: "600px",
        md: "728px",
        lg: "984px",
        xl: "1240px",
      },
    },

    extend: {
      colors: {
        scz: {
          dark: "#1b0d08",
          darker: "#140905",
          medium: "#341A09",
          gold: "#C5A572",
        },
      },

      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },

      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.75rem",
      },

      boxShadow: {
        premium: "0 4px 18px rgba(0,0,0,0.25)",
        inset: "inset 0 0 12px rgba(0,0,0,0.4)",
        "sidebar-float":
          "0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px -8px rgba(0,0,0,0.55), 0 24px 48px -16px rgba(0,0,0,0.45)",
        "bronze-glow": "0 0 20px rgba(197, 165, 114, 0.12)",
        "agenda-panel":
          "0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 0 rgba(243,216,182,0.04) inset, 0 12px 40px -12px rgba(0,0,0,0.5)",
      },

      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)",
      },

      animation: {
        fadeIn: "fadeIn 0.4s ease-out",
      },

      keyframes: {
        fadeIn: {
          from: { opacity: 0, transform: "translateY(6px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
