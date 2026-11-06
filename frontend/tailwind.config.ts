import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
        },
        neutral: {
          0: '#FFFFFF',
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          900: '#0F172A',
        },
        success: { DEFAULT: '#16A34A', bg: '#DCFCE7', text: '#15803D' },
        warning: { DEFAULT: '#D97706', bg: '#FEF3C7', text: '#B45309' },
        danger: { DEFAULT: '#DC2626', bg: '#FEE2E2', text: '#B91C1C' },
        info: { DEFAULT: '#0284C7', bg: '#E0F2FE', text: '#0369A1' },
        mastery: {
          untested: '#94A3B8',
          weak: '#DC2626',
          developing: '#D97706',
          strong: '#16A34A',
        },
        doc: { processing: '#D97706', ready: '#16A34A', failed: '#DC2626' },
        plan: { study: '#4F46E5', revision: '#D97706' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs: '12px',
        sm: '14px',
        base: '16px',
        lg: '18px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '30px',
      },
      fontWeight: { regular: '400', medium: '500', semibold: '600' },
      lineHeight: { tight: '1.25', normal: '1.5' },
      borderRadius: { sm: '6px', md: '10px', lg: '16px' },
      boxShadow: {
        card: '0 1px 3px rgba(15,23,42,0.08)',
        popover: '0 8px 24px rgba(15,23,42,0.14)',
        glass: '0 10px 32px rgba(15,23,42,0.10)',
      },
      opacity: { 62: '0.62', 72: '0.72', 90: '0.90', 94: '0.94' },
      backdropBlur: { glass: '20px' },
      backgroundImage: {
        'glass-backdrop':
          'linear-gradient(135deg, #EEF2FF 0%, #F8FAFC 50%, #E0F2FE 100%)',
      },
      maxWidth: { content: '960px', chat: '760px' },
      spacing: { sidebar: '240px', rail: '72px' },
    },
  },
  plugins: [],
} satisfies Config
