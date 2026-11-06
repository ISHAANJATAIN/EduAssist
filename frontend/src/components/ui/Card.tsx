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
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">{title}</h2>
      ) : null}
      {children}
    </section>
  )
}
