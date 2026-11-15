/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#FBF9F5',
        milk: '#FFFFFF',
        ink: { DEFAULT: '#191715', soft: '#2A2724' },
        terracotta: { DEFAULT: '#8B6244', soft: '#F4ECE4', deep: '#6F4D34' },
        sage: { DEFAULT: '#2E7D47', soft: '#E6F1E9', deep: '#225E35' },
        sand: { DEFAULT: '#EAE6DF', soft: '#F3F0EA', deep: '#D9D3C9' },
        muted: '#716B64',
        amber: { DEFAULT: '#D97706', soft: '#FDF1E1' },
        danger: { DEFAULT: '#B4412F', soft: '#F8E7E3' },
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(25,23,21,0.04), 0 1px 1px rgba(25,23,21,0.02)',
        lift: '0 12px 32px -12px rgba(25,23,21,0.18), 0 2px 6px rgba(25,23,21,0.05)',
        sheet: '0 -16px 48px -12px rgba(25,23,21,0.22)',
      },
      keyframes: {
        'amber-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(217,119,6,0.35)' },
          '50%': { boxShadow: '0 0 0 6px rgba(217,119,6,0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        scan: { '0%': { top: '0%' }, '100%': { top: '100%' } },
      },
      animation: {
        'amber-pulse': 'amber-pulse 1.6s ease-in-out infinite',
        shimmer: 'shimmer 1.4s infinite',
        scan: 'scan 1.2s ease-in-out infinite alternate',
      },
    },
  },
  plugins: [],
};
