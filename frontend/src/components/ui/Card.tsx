import type { ReactNode } from 'react'

interface CardProps {
  title?: string
  children: ReactNode
  className?: string
}

export function Card({ title, children, className = '' }: CardProps) {
  return (
    <section className={`glass p-6 ${className}`}>
      {title ? (
        <h2 className="font-display mb-4 text-[21px] font-semibold leading-tight tracking-[-0.02em] text-ink">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  )
}
