/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#22C55E',
          50: '#EAFBF1',
          100: '#D2F6E0',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
        },
        secondary: '#0F172A',
        accent: {
          DEFAULT: '#38BDF8',
          400: '#7DD3FC',
          600: '#0284C7',
        },
        bg: {
          DEFAULT: '#020617',
          card: '#111827',
          elevated: '#161F2E',
        },
        border: {
          DEFAULT: 'rgba(148, 163, 184, 0.12)',
        },
        danger: '#F87171',
        warning: '#FBBF24',
        info: '#38BDF8',
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        soft: '0 8px 30px rgba(0,0,0,0.35)',
        glow: '0 0 0 1px rgba(34,197,94,0.15), 0 0 24px rgba(34,197,94,0.15)',
        'glow-accent': '0 0 0 1px rgba(56,189,248,0.15), 0 0 24px rgba(56,189,248,0.15)',
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
      animation: {
        scan: 'scan 3s linear infinite',
        pulseGlow: 'pulseGlow 2s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};
