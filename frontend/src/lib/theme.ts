import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'eduassist.theme'

const listeners = new Set<() => void>()

function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? systemTheme()
}

let current: Theme = document.documentElement.classList.contains('dark')
  ? 'dark'
  : resolveInitialTheme()

export function getTheme(): Theme {
  return current
}

export function setTheme(theme: Theme): void {
  current = theme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Private browsing can reject writes; the theme still applies for this page.
  }
  for (const listener of listeners) listener()
}

export function toggleTheme(): void {
  setTheme(current === 'dark' ? 'light' : 'dark')
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'light')
  return { theme, isDark: theme === 'dark', setTheme, toggleTheme }
}
