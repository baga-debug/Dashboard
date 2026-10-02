/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter','Segoe UI','system-ui','sans-serif'],
        mono: ['JetBrains Mono','ui-monospace','SFMono-Regular','monospace'],
      },
      colors: {
        brand: { 50:'#f0f9ff', 500:'#0ea5e9', 600:'#0284c7', 700:'#0369a1', 900:'#0c4a6e' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.06)',
        cardHover: '0 4px 12px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
}

