import type { ReactNode } from 'react'

import { Button } from '@/components/ui/Button'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-neutral-300 px-6 py-10 text-center">
      <div className="text-neutral-500">{icon}</div>
      <h2 className="mt-3 text-lg font-semibold text-neutral-900">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-neutral-600">{description}</p>
      {action ? (
        <Button variant="secondary" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}
