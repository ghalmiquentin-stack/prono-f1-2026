/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#15151E',
        accent: '#E8002D',
        gold: '#FFD700',
        silver: '#C0C0C0',
        bronze: '#CD7F32',
        surface: '#1E1E2E',
        surfaceHigh: '#2A2A3E',
        border: '#2E2E42',
        muted: '#6B6B8A',
        player: {
          william: '#3B82F6',
          quentin: '#22C55E',
          alex: '#F97316',
          romain: '#A855F7',
        }
      },
      fontFamily: {
        sans: ['Titillium Web', 'sans-serif'],
      },
      boxShadow: {
        'glow-red': '0 0 20px rgba(232, 0, 45, 0.4)',
        'glow-red-sm': '0 0 10px rgba(232, 0, 45, 0.3)',
        'glow-gold': '0 0 20px rgba(255, 215, 0, 0.4)',
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-glow': 'pulseGlow 2s infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(232, 0, 45, 0.3)' },
          '50%': { boxShadow: '0 0 25px rgba(232, 0, 45, 0.6)' },
        },
      },
    },
  },
  plugins: [],
}
