/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#e0eaff',
          200: '#c2d4ff',
          300: '#93b4fd',
          400: '#608bfa',
          500: '#3b62f6',
          600: '#2545eb',
          700: '#1c36d8',
          800: '#1d2faf',
          900: '#1e2e89',
          950: '#151d5c',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f8f9fc',
          border: '#e2e8f0',
          dark: '#0d1117',
          'dark-muted': '#161b27',
          'dark-border': '#21262e',
        },
        signal: {
          above: '#16a34a',
          within: '#2563eb',
          below: '#dc2626',
          insufficient: '#9ca3af',
        },
        urgency: {
          high: '#dc2626',
          medium: '#d97706',
          low: '#6b7280',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
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
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.10), 0 2px 4px -1px rgba(0,0,0,0.06)',
        'notification': '0 8px 24px -4px rgba(0,0,0,0.18), 0 4px 8px -2px rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
}

