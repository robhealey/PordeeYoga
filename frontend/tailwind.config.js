/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sage: {
          50: "#f4f6f3",
          100: "#e5eae1",
          200: "#ccd6c4",
          300: "#a9ba9c",
          400: "#87a072",
          500: "#6b8555",
          600: "#546a42",
          700: "#425437",
          800: "#38452f",
          900: "#303b2a",
        },
      },
    },
  },
  plugins: [],
};
