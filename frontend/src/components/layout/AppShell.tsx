import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { Sidebar } from '@/components/layout/Sidebar'
import { MenuIcon } from '@/components/ui/Icon'
import { Logo } from '@/components/ui/Logo'
import { useCourse } from '@/hooks/useCourse'
import { formatDate } from '@/lib/format'

const pageTitles: Record<string, string> = {
  '/': 'Chat',
  '/library': 'Library',
  '/dashboard': 'Dashboard',
  '/planner': 'Planner',
  '/settings': 'Settings',
}

function Backdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-glass-backdrop"
    >
      <div className="absolute -left-24 top-[-10%] h-[420px] w-[420px] rounded-full bg-[#A5B4FC] opacity-[0.55] blur-3xl" />
      <div className="absolute right-[-8%] top-[18%] h-[380px] w-[380px] rounded-full bg-[#7DD3FC] opacity-[0.55] blur-3xl" />
      <div className="absolute bottom-[-12%] left-[35%] h-[440px] w-[440px] rounded-full bg-[#C4B5FD] opacity-[0.55] blur-3xl" />
    </div>
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
        <header className="flex h-16 items-center justify-between border-b border-neutral-200/80 bg-white/50 px-4 backdrop-blur-glass md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
            className="rounded-md p-1 text-neutral-700 hover:bg-neutral-100"
          >
            <MenuIcon size={22} />
          </button>
          <Logo size={26} />
          <span className="w-8" aria-hidden="true" />
        </header>

        <header className="hidden h-16 items-center justify-between border-b border-neutral-200/80 bg-white/50 px-6 backdrop-blur-glass md:flex">
          <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
          {examDate ? (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-600">
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
