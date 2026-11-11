import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070B16',
          900: '#0B1120',
          850: '#0F1629',
          800: '#141C33',
          700: '#1C2541',
          600: '#29335A',
          500: '#3A4672',
        },
        mist: { 50: '#F5F7FB', 100: '#E7EBF3', 200: '#C9D0E0', 300: '#9AA4BD', 400: '#7480A0', 500: '#56617F' },
        volt: { 300: '#7DEBFF', 400: '#38D9F5', 500: '#12BFE0', 600: '#0A9BBA' },
        signal: { blue: '#4F7DFF', green: '#2FD08A', amber: '#F5B544', red: '#F2626B' },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(56,217,245,0.35), 0 8px 30px -8px rgba(18,191,224,0.35)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { 'fade-in': 'fade-in 240ms ease-out both' },
    },
  },
  plugins: [],
} satisfies Config;
