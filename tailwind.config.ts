import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        fg: token('fg'),
        muted: token('muted'),
        faint: token('faint'),
        subtle: token('subtle'),
        hover: token('hover'),
        line: token('line'),
        'line-strong': token('line-strong'),
        primary: { DEFAULT: token('primary'), hover: token('primary-hover'), fg: token('primary-fg') },
        accent: { soft: token('accent-soft'), ink: token('accent-ink') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft'), line: token('danger-line') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        info: { DEFAULT: token('info'), soft: token('info-soft') },
        violet: { DEFAULT: token('violet'), soft: token('violet-soft') },
        ring: token('ring'),
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['11px', '14px'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(30 28 24 / 0.04)',
        pop: '0 8px 24px rgb(30 28 24 / 0.12), 0 1px 3px rgb(30 28 24 / 0.08)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
    },
  },
  plugins: [animate],
} satisfies Config;
