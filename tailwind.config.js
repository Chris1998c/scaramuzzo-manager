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
