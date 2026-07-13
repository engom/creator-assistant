/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f7f6ff',
          100: '#eeeeff',
          200: '#d8d4ff',
          300: '#bcb0ff',
          400: '#9d8fff',
          500: '#7c6fff',
          600: '#6552f0',
          700: '#5340e0',
          800: '#4330c0',
          900: '#3222a0',
          950: '#1e1470',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f8f9fc',
          border: '#e2e8f0',
          dark: '#07090e',
          'dark-muted': '#0f1420',
          'dark-border': '#1c2334',
          'dark-card': '#0f1420',
          'dark-hover': '#161c2c',
          'dark-rim': '#252e42',
        },
        signal: {
          above: '#22c55e',
          within: '#60a5fa',
          below: '#f87171',
          insufficient: '#6b7280',
        },
        urgency: {
          high: '#f87171',
          medium: '#fbbf24',
          low: '#4a5568',
        },
        live: {
          DEFAULT: '#00d4aa',
          dim: '#003d31',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', '"JetBrains Mono"', 'monospace'],
        display: ['"DM Mono"', 'monospace'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
      animation: {
        'slide-up': 'slideUp 0.32s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-right': 'slideInRight 0.35s cubic-bezier(0.16,1,0.3,1)',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-ring': 'pulseRing 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.6s ease-in-out infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(20px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        pulseRing: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(220,38,38,0.4)' },
          '50%':       { boxShadow: '0 0 0 10px rgba(220,38,38,0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(124,111,255,0.3)' },
          '50%':       { boxShadow: '0 0 20px 4px rgba(124,111,255,0.15)' },
        },
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.10), 0 2px 4px -1px rgba(0,0,0,0.06)',
        'notification': '0 8px 24px -4px rgba(0,0,0,0.18), 0 4px 8px -2px rgba(0,0,0,0.10)',
        'brand-glow': '0 0 20px rgba(124,111,255,0.25)',
        'bottom-nav': '0 -1px 0 rgba(255,255,255,0.04), 0 -12px 32px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
}
