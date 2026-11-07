import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { Sidebar } from '@/components/layout/Sidebar'
import { MenuIcon } from '@/components/ui/Icon'
import { Logo } from '@/components/ui/Logo'
import { useCourse } from '@/hooks/useCourse'
import { formatDate } from '@/lib/format'

const pageTitles: Record<string, string> = {
  '/chat': 'Chat',
  '/library': 'Library',
  '/dashboard': 'Dashboard',
  '/planner': 'Planner',
  '/settings': 'Settings',
}

function Backdrop() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-glass-backdrop"
      />
      <div
        aria-hidden="true"
        className="landing-grain pointer-events-none fixed inset-0 z-50"
      />
    </>
  )
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const course = useCourse()

  const title = pageTitles[pathname] ?? 'EduAssist'
  const examDate = course.data?.exam_date

  return (
    <div className="min-h-screen">
      <Backdrop />
      <Sidebar mobileOpen={menuOpen} onMobileClose={() => setMenuOpen(false)} />

      <div className="md:pl-rail lg:pl-sidebar">
        <header className="flex h-16 items-center justify-between border-b border-ink/10 bg-paper/85 px-4 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
            className="rounded-full p-1.5 text-ink transition hover:bg-ink/5"
          >
            <MenuIcon size={22} />
          </button>
          <Logo size={26} />
          <span className="w-8" aria-hidden="true" />
        </header>

        <header className="hidden h-16 items-center justify-between border-b border-ink/10 bg-paper/85 px-6 backdrop-blur md:flex">
          <h1 className="text-[22px] font-semibold text-ink">{title}</h1>
          {examDate ? (
            <span className="font-label rounded-full border border-gold-light/40 bg-paper-card px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-gold">
              AI · Exam {formatDate(examDate)}
            </span>
          ) : null}
        </header>

        <main className="mx-auto w-full max-w-content px-4 py-6 md:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
