import { MoonIcon, SunIcon } from '@/components/ui/Icon'
import { useTheme } from '@/lib/theme'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { isDark, toggleTheme } = useTheme()
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-paper-card text-neutral-600 transition duration-200 hover:border-ink/25 hover:text-ink ${className}`}
    >
      {isDark ? <SunIcon size={17} /> : <MoonIcon size={17} />}
    </button>
  )
}
