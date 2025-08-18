/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js}", "./public/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        'un-black': '#000000',
        'un-white': '#FFFFFF',
        'un-gold': '#FFD700',
      },
    },
  },
  plugins: [],
}