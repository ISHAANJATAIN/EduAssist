import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import { api } from '@/api/client'
import { SettingsPage } from '@/pages/SettingsPage'
import { useCreatePlan, planKey } from '@/hooks/usePlan'
import { useChat } from '@/hooks/useChat'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'

const course = { id: 'course-test', name: 'Test Course', exam_date: '2026-12-01', free_hours_per_day: 2 }
const account = { id: 'a', name: 'Test A', email: 'a@example.invalid', created_at: '2026-01-01T00:00:00Z' }
const plan = { id: 'plan-a', exam_date: '2026-12-01', feasible: true, days: [], notes: [] }
const originalAdapter = api.defaults.adapter
let client: QueryClient
const requests: { config: InternalAxiosRequestConfig; resolve: (response: AxiosResponse) => void }[] = []
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
function renderPage() {
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/settings']}><Routes>
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/chat" element={<div>chat-home</div>} />
  </Routes></MemoryRouter></QueryClientProvider>)
}
async function respond(url: string, data: unknown) {
  await waitFor(() => expect(requests.some((r) => r.config.url === url)).toBe(true))
  const index = requests.findIndex((r) => r.config.url === url)
  const request = requests.splice(index, 1)[0]
  await act(async () => request.resolve({ config: request.config, data, status: 200, statusText: 'OK', headers: {} }))
}
async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Delete my data' }))
  await user.type(screen.getByLabelText(/Type DELETE to confirm/), 'DELETE')
  await user.click(screen.getByRole('button', { name: 'Delete everything' }))
  await waitFor(() => expect(requests.some((r) => r.config.url === '/me/data')).toBe(true))
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useAuthStore.getState().setSession('a-token', account, client)
  requests.length = 0
  api.defaults.adapter = (config) => {
    if (config.method === 'get' && config.url === '/course') return Promise.resolve({ config, data: course, status: 200, statusText: 'OK', headers: {} })
    if (config.url === '/chat/history') return Promise.resolve({ config, data: [], status: 200, statusText: 'OK', headers: {} })
    return new Promise((resolve) => requests.push({ config, resolve }))
  }
})
afterEach(() => { cleanup(); client.clear(); api.defaults.adapter = originalAdapter })

describe('SettingsPage real queries and stores', () => {
  it('saves course defaults as numbers and nullable dates', async () => {
    const user = userEvent.setup()
    renderPage()
    const name = await screen.findByLabelText('Course name')
    await user.clear(name)
    await user.type(name, 'Databases')
    await user.clear(screen.getByLabelText('Exam date'))
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(JSON.parse(requests[0].config.data)).toEqual({ name: 'Databases', exam_date: null, free_hours_per_day: 2 })
    await respond('/course', { ...course, name: 'Databases', exam_date: null })
    expect(await screen.findByText('Settings saved')).toBeInTheDocument()
  })

  it('disables every course input during a deferred save', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText('Course name')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    for (const label of ['Course name', 'Exam date', 'Free hours per day']) expect(screen.getByLabelText(label)).toBeDisabled()
    await respond('/course', course)
    await waitFor(() => expect(screen.getByLabelText('Course name')).toBeEnabled())
  })

  it('rejects blank hours instead of silently saving zero', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText('Course name')
    await user.clear(screen.getByLabelText('Free hours per day'))
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(requests).toHaveLength(0)
  })

  it('deletes data only after confirmation and keeps login', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText('Course name')
    await user.click(screen.getByRole('button', { name: 'Delete my data' }))
    expect(screen.getByRole('button', { name: 'Delete everything' })).toBeDisabled()
    expect(requests).toHaveLength(0)
    await user.type(screen.getByLabelText(/Type DELETE to confirm/), 'DELETE')
    await user.click(screen.getByRole('button', { name: 'Delete everything' }))
    await respond('/me/data', undefined)
    expect(await screen.findByText('chat-home')).toBeInTheDocument()
    expect(useAuthStore.getState().token).toBe('a-token')
  })

  it('pending privacy deletion invalidates old plan and chat replies before deletion responds', async () => {
    const user = userEvent.setup()
    const planHook = renderHook(() => useCreatePlan(), { wrapper })
    const chatHook = renderHook(() => useChat(), { wrapper })
    await waitFor(() => expect(useChatStore.getState().hydrated).toBe(true))
    act(() => { planHook.result.current.mutate({}); chatHook.result.current.send('A private plan', 'planner') })
    await waitFor(() => expect(requests).toHaveLength(2))
    renderPage()
    await screen.findByLabelText('Course name')
    await confirmDelete(user)
    await respond('/plans', plan)
    await respond('/chat', { message_id: 'old-reply', intent: 'planner', reply: { type: 'plan', plan } })
    await waitFor(() => expect(planHook.result.current.isPending).toBe(false))
    expect(client.getQueryData(planKey)).toBeUndefined()
    expect(useChatStore.getState().messages).toEqual([])
    expect(useAuthStore.getState().token).toBe('a-token')
    await respond('/me/data', undefined)
    expect(await screen.findByText('chat-home')).toBeInTheDocument()
    expect(client.getQueryData(planKey)).toBeUndefined()
  })

  it('late deletion success cannot clear B data or navigate after account replacement', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByLabelText('Course name')
    await confirmDelete(user)
    act(() => {
      useAuthStore.getState().setSession('b-token', { ...account, id: 'b', name: 'Test B' }, client)
      client.setQueryData(planKey, { ...plan, id: 'plan-b' })
      useChatStore.getState().appendUser('B private')
    })
    await respond('/me/data', undefined)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete my data' })).toBeEnabled())
    expect(client.getQueryData(planKey)).toMatchObject({ id: 'plan-b' })
    expect(useChatStore.getState().messages.map((m) => m.text)).toEqual(['B private'])
    expect(screen.queryByText('chat-home')).not.toBeInTheDocument()
  })
})
