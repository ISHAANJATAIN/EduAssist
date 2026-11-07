import type { ComponentType } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { NavLink, useNavigate } from 'react-router-dom'

import {
  ChatIcon,
  CloseIcon,
  DashboardIcon,
  LibraryIcon,
  PlannerIcon,
  SettingsIcon,
} from '@/components/ui/Icon'
import { Logo } from '@/components/ui/Logo'
import { useAuthStore } from '@/store/authStore'

const navItems: {
  to: string
  label: string
  icon: ComponentType<{ size?: number }>
  end?: boolean
}[] = [
  { to: '/chat', label: 'Chat', icon: ChatIcon, end: true },
  { to: '/library', label: 'Library', icon: LibraryIcon },
  { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { to: '/planner', label: 'Planner', icon: PlannerIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

function NavList({
  rail = false,
  onNavigate,
}: {
  rail?: boolean
  onNavigate?: () => void
}) {
  return (
    <nav aria-label="Main" className="space-y-1">
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          aria-label={label}
          title={rail ? label : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-full py-2.5 text-[15px] transition duration-200 ${
              rail ? 'justify-center px-0 lg:justify-start lg:px-4' : 'px-4'
            } ${
              isActive
                ? 'bg-ink font-semibold text-paper shadow-[0_10px_22px_-14px_rgba(18,22,31,0.7)]'
                : 'text-neutral-700 hover:bg-ink/5 hover:text-ink'
            }`
          }
        >
          <Icon size={20} />
          <span className={rail ? 'hidden lg:inline' : ''}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function AccountFooter({ rail = false }: { rail?: boolean }) {
  const user = useAuthStore((state) => state.user)
  const clearSession = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const initials =
    user?.name
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() ?? '?'

  function handleLogout() {
    clearSession()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <div
      className={`border-t border-ink/10 pt-4 ${
        rail ? 'px-0 lg:px-1' : 'px-1'
      }`}
    >
      <div
        className={`flex items-center gap-3 ${
          rail ? 'justify-center lg:justify-start' : ''
        }`}
      >
        <span
          title={user?.name ?? 'Account'}
          className="font-label flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold-light/50 bg-paper-deep text-[11px] font-medium text-gold"
        >
          {initials}
        </span>
        <div
          className={
            rail ? 'hidden min-w-0 flex-1 lg:block' : 'min-w-0 flex-1'
          }
        >
          <p className="truncate text-sm font-semibold text-ink">
            {user?.name ?? 'Account'}
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs text-neutral-600 underline decoration-ink/20 underline-offset-2 transition hover:text-ink hover:decoration-ink"
          >
            Log out
          </button>
        </div>
      </div>
      {rail ? (
        <button
          type="button"
          onClick={handleLogout}
          className="mt-3 w-full text-center text-xs text-neutral-600 hover:text-ink lg:hidden"
        >
          Out
        </button>
      ) : null}
    </div>
  )
}

interface SidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-ink/10 bg-paper-deep/70 md:flex md:w-rail lg:w-sidebar">
        <div className="flex h-16 items-center border-b border-ink/10 px-4 lg:px-6">
          <div className="lg:hidden">
            <Logo size={28} showWordmark={false} />
          </div>
          <div className="hidden lg:block">
            <Logo size={28} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavList rail />
        </div>

        <div className="px-3 py-4">
          <AccountFooter rail />
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onMobileClose}
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="relative flex h-full w-[280px] flex-col border-r border-ink/10 bg-paper p-4 shadow-popover"
          >
            <div className="flex h-12 items-center justify-between px-2">
              <Logo size={28} />
              <button
                type="button"
                onClick={onMobileClose}
                aria-label="Close navigation"
                className="rounded-full p-1.5 text-neutral-600 transition hover:bg-ink/5 hover:text-ink"
              >
                <CloseIcon size={20} />
              </button>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto">
              <NavList onNavigate={onMobileClose} />
            </div>
            <AccountFooter />
          </div>
        </div>
      ) : null}
    </>
  )
}
