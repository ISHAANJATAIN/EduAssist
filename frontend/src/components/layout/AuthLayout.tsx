import type { ReactNode } from 'react'

import { CheckIcon } from '@/components/ui/Icon'
import { Logo } from '@/components/ui/Logo'

const features = [
  'Cited answers, every time',
  'Quizzes that adapt to you',
  'A plan built around your exam',
]

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[600px_1fr]">
      <aside className="hidden bg-brand-600 p-12 text-white lg:flex lg:flex-col">
        <Logo size={40} tone="onBrand" />
        <div className="my-auto max-w-sm">
          <h1 className="text-3xl font-semibold leading-tight">
            Study from your own material.
          </h1>
          <p className="mt-4 text-sm text-brand-100">
            One place to ask, practise and plan.
          </p>
          <ul className="mt-8 space-y-4 text-sm">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15">
                  <CheckIcon size={15} />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-brand-100">
          Local model. Your material never leaves this device.
        </p>
      </aside>

      <div className="flex items-center justify-center px-4 py-10 lg:px-9">
        <div className="glass w-full max-w-[368px] p-8">
          <div className="mb-6 lg:hidden">
            <Logo size={34} />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
