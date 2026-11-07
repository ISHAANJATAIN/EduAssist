import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { CheckIcon } from '@/components/ui/Icon'
import { Logo } from '@/components/ui/Logo'

const features = [
  'Cited answers, every time',
  'Quizzes that adapt to you',
  'A plan built around your exam',
]

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-screen bg-paper lg:grid-cols-[600px_1fr]">
      <div
        aria-hidden="true"
        className="landing-grain pointer-events-none fixed inset-0 z-50"
      />
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-paper lg:flex lg:flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(199,154,91,0.22),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-48 -left-32 h-[480px] w-[480px] rounded-full bg-[radial-gradient(closest-side,rgba(79,70,229,0.18),transparent)]"
        />
        <Link
          to="/"
          aria-label="EduAssist home"
          className="relative inline-flex self-start"
        >
          <Logo size={40} tone="onBrand" />
        </Link>
        <div className="relative my-auto max-w-sm">
          <p className="font-label text-[11px] uppercase tracking-[0.22em] text-gold-light">
            Your study desk
          </p>
          <h1 className="mt-4 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em]">
            Study from your own{' '}
            <em className="font-normal italic text-gold-leaf">material.</em>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-paper/70">
            One place to ask, practise and plan.
          </p>
          <ul className="mt-9 space-y-4 text-sm">
            {features.map((feature) => (
              <li
                key={feature}
                className="flex items-center gap-3 border-b border-white/10 pb-4 last:border-0 last:pb-0"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gold-light/40 text-gold-leaf">
                  <CheckIcon size={14} />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <p className="font-label relative text-[11px] uppercase tracking-[0.16em] text-paper/55">
          Local model. Your material never leaves this device.
        </p>
      </aside>

      <div className="flex items-center justify-center px-4 py-10 lg:px-9">
        <div className="w-full max-w-[368px]">
          <Link
            to="/"
            className="group mb-4 inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-neutral-600 transition hover:text-ink"
          >
            <span
              aria-hidden="true"
              className="transition-transform duration-200 group-hover:-translate-x-1"
            >
              ←
            </span>{' '}
            Back to home
          </Link>

          <div className="glass w-full p-8">
            <div className="mb-6 lg:hidden">
              <Link
                to="/"
                aria-label="EduAssist home"
                className="inline-flex"
              >
                <Logo size={34} />
              </Link>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
