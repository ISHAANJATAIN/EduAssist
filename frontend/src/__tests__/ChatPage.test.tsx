import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { api } from '@/api/client'
import { ChatPage } from '@/pages/ChatPage'
import { useAuthStore } from '@/store/authStore'

let client: QueryClient
const originalAdapter = api.defaults.adapter
const originalScroll = HTMLElement.prototype.scrollIntoView
let historyRequest: { config: InternalAxiosRequestConfig; resolve: (value: AxiosResponse) => void; reject: (cause: unknown) => void }
beforeEach(() => {
  // jsdom does not implement scrolling; the real chat components still render.
  HTMLElement.prototype.scrollIntoView = () => {}
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useAuthStore.getState().setSession('test-token', { id: 'a', name: 'Test A', email: 'a@example.invalid', created_at: '2026-01-01T00:00:00Z' }, client)
  api.defaults.adapter = (config) => new Promise((resolve, reject) => { historyRequest = { config, resolve, reject } })
})
afterEach(() => { cleanup(); client.clear(); api.defaults.adapter = originalAdapter; HTMLElement.prototype.scrollIntoView = originalScroll })

it('shows delayed history loading, then an actionable history error, and enables sends only after retry', async () => {
  const user = userEvent.setup()
  render(<QueryClientProvider client={client}><ChatPage /></QueryClientProvider>)
  expect(screen.getByRole('status')).toHaveTextContent(/loading.*history/i)
  await user.type(screen.getByLabelText('Message'), 'synthetic question')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  await waitFor(() => expect(historyRequest).toBeDefined())
  await act(async () => historyRequest.reject(new Error('History unavailable')))
  expect(await screen.findByRole('alert')).toHaveTextContent('History unavailable')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: /retry/i }))
  await act(async () => historyRequest.resolve({ config: historyRequest.config, data: [], status: 200, statusText: 'OK', headers: {} }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
