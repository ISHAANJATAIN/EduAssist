import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { Spinner } from '@/components/ui/Spinner'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
  children: ReactNode
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-action text-on-action shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:-translate-y-0.5 hover:bg-action-hover hover:shadow-[0_14px_28px_-16px_rgb(var(--shadow-rgb)/0.65)] active:translate-y-0',
  secondary:
    'border border-ink/15 bg-paper-card text-ink hover:-translate-y-0.5 hover:border-ink/35 hover:shadow-[0_12px_24px_-18px_rgb(var(--shadow-rgb)/0.45)] active:translate-y-0',
  danger:
    'bg-danger text-danger-on hover:-translate-y-0.5 hover:bg-danger-text hover:shadow-[0_14px_28px_-16px_rgb(var(--danger)/0.55)] active:translate-y-0',
  ghost: 'text-neutral-700 hover:bg-ink/5 hover:text-ink',
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition duration-200 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {loading ? <Spinner size="sm" /> : null}
      {children}
    </button>
  )
}
