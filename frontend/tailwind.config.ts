import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        white: 'rgb(var(--surface-card) / <alpha-value>)',
        brand: {
          50: 'rgb(var(--surface-deep) / <alpha-value>)',
          100: 'rgb(var(--line) / <alpha-value>)',
          500: 'rgb(var(--indigo) / <alpha-value>)',
          600: 'rgb(var(--ink) / <alpha-value>)',
          700: 'rgb(var(--content) / <alpha-value>)',
        },
        neutral: {
          0: 'rgb(var(--surface-card) / <alpha-value>)',
          50: 'rgb(var(--surface-raised) / <alpha-value>)',
          100: 'rgb(var(--surface-deep) / <alpha-value>)',
          200: 'rgb(var(--line) / <alpha-value>)',
          300: 'rgb(var(--line-strong) / <alpha-value>)',
          500: 'rgb(var(--content-muted) / <alpha-value>)',
          600: 'rgb(var(--content-soft) / <alpha-value>)',
          700: 'rgb(var(--content) / <alpha-value>)',
          900: 'rgb(var(--ink) / <alpha-value>)',
        },
        paper: {
          DEFAULT: 'rgb(var(--surface-page) / <alpha-value>)',
          card: 'rgb(var(--surface-card) / <alpha-value>)',
          deep: 'rgb(var(--surface-deep) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)',
        },
        panel: 'rgb(var(--panel) / <alpha-value>)',
        'on-panel': 'rgb(var(--on-panel) / <alpha-value>)',
        bubble: 'rgb(var(--bubble) / <alpha-value>)',
        'on-bubble': 'rgb(var(--on-bubble) / <alpha-value>)',
        action: {
          DEFAULT: 'rgb(var(--action) / <alpha-value>)',
          hover: 'rgb(var(--action-hover) / <alpha-value>)',
        },
        'on-action': 'rgb(var(--on-action) / <alpha-value>)',
        gold: {
          DEFAULT: 'rgb(var(--gold) / <alpha-value>)',
          light: 'rgb(var(--gold-light) / <alpha-value>)',
          leaf: 'rgb(var(--gold-leaf) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          bg: 'rgb(var(--success-bg) / <alpha-value>)',
          text: 'rgb(var(--success-text) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          bg: 'rgb(var(--warning-bg) / <alpha-value>)',
          text: 'rgb(var(--warning-text) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          bg: 'rgb(var(--danger-bg) / <alpha-value>)',
          text: 'rgb(var(--danger-text) / <alpha-value>)',
          on: 'rgb(var(--danger-on) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          bg: 'rgb(var(--info-bg) / <alpha-value>)',
          text: 'rgb(var(--info-text) / <alpha-value>)',
        },
        mastery: {
          untested: 'rgb(var(--mastery-untested) / <alpha-value>)',
          weak: 'rgb(var(--danger) / <alpha-value>)',
          developing: 'rgb(var(--warning) / <alpha-value>)',
          strong: 'rgb(var(--success) / <alpha-value>)',
        },
        doc: {
          processing: 'rgb(var(--warning) / <alpha-value>)',
          ready: 'rgb(var(--success) / <alpha-value>)',
          failed: 'rgb(var(--danger) / <alpha-value>)',
        },
        plan: {
          study: 'rgb(var(--indigo) / <alpha-value>)',
          revision: 'rgb(var(--warning) / <alpha-value>)',
        },
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
        card: '0 1px 2px rgb(var(--shadow-rgb) / 0.06)',
        popover: '0 24px 48px -24px rgb(var(--shadow-rgb) / 0.45)',
        glass:
          '0 1px 2px rgb(var(--shadow-rgb) / 0.04), 0 18px 40px -30px rgb(var(--shadow-rgb) / 0.35)',
        lift: '0 24px 48px -32px rgb(var(--shadow-rgb) / 0.4)',
      },
      opacity: { 62: '0.62', 72: '0.72', 90: '0.90', 94: '0.94' },
      backdropBlur: { glass: '20px' },
      backgroundImage: {
        'glass-backdrop':
          'linear-gradient(180deg, rgb(var(--surface-page)) 0%, rgb(var(--surface-page-end)) 100%)',
      },
      maxWidth: { content: '960px', chat: '760px' },
      spacing: { sidebar: '240px', rail: '72px' },
    },
  },
  plugins: [],
} satisfies Config
