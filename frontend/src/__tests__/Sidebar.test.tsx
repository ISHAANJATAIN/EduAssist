import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Sidebar } from '@/components/layout/Sidebar'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'

let client: QueryClient
function Navigation() {
  const [open, setOpen] = useState(false)
  return <><button onClick={() => setOpen(true)}>Open navigation</button><Sidebar mobileOpen={open} onMobileClose={() => setOpen(false)} /><button>Outside</button></>
}
function renderNavigation() {
  render(<QueryClientProvider client={client}><MemoryRouter><Routes><Route path="/" element={<Navigation />} /><Route path="/login" element={<div>login-home</div>} /></Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  client = new QueryClient()
  useAuthStore.getState().setSession('test-token', { id: 'a', name: 'Test A', email: 'a@example.invalid', created_at: '2026-01-01T00:00:00Z' }, client)
})
afterEach(() => { cleanup(); client.clear() })

describe('Sidebar mobile navigation', () => {
  it('focuses inside the dialog on entry and restores the opener on close', async () => {
    const user = userEvent.setup()
    renderNavigation()
    const opener = screen.getByRole('button', { name: 'Open navigation' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Navigation' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: 'Close navigation' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('traps forward and backward Tab at the dialog boundaries', async () => {
    const user = userEvent.setup()
    renderNavigation()
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const dialog = screen.getByRole('dialog')
    const first = within(dialog).getByRole('button', { name: 'Close navigation' })
    const last = within(dialog).getByRole('button', { name: 'Log out' })
    last.focus()
    await user.tab()
    expect(first).toHaveFocus()
    first.focus()
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
  })

  it('Escape closes the dialog and restores focus', async () => {
    const user = userEvent.setup()
    renderNavigation()
    const opener = screen.getByRole('button', { name: 'Open navigation' })
    await user.click(opener)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('logout clears chat and the provider cache before navigating', async () => {
    const user = userEvent.setup()
    renderNavigation()
    useChatStore.getState().appendUser('private')
    client.setQueryData(['private'], 'private')
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Log out' }))
    expect(await screen.findByText('login-home')).toBeInTheDocument()
    expect(useAuthStore.getState().token).toBeNull()
    expect(useChatStore.getState().messages).toEqual([])
    expect(client.getQueryData(['private'])).toBeUndefined()
  })
})
