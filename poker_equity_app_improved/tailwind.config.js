/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        felt: {
          900: '#07120e',
          800: '#0c1e17',
          700: '#112920',
          600: '#18382c',
        }
      }
    },
  },
  plugins: [],
}
