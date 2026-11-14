import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { api } from '@/api/client'
import { ChatPage } from '@/pages/ChatPage'
import { useAuthStore } from '@/store/authStore'

interface Pending {
  config: InternalAxiosRequestConfig
  resolve: (value: AxiosResponse) => void
  reject: (cause: unknown) => void
}

let client: QueryClient
const originalAdapter = api.defaults.adapter
const originalScroll = HTMLElement.prototype.scrollIntoView
let requests: Pending[] = []
let sessionsData: unknown[] = []

function settled(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: 'OK', headers: {} }
}

async function respond(url: string, data: unknown) {
  await waitFor(() => expect(requests.some((request) => request.config.url === url)).toBe(true))
  const index = requests.findIndex((request) => request.config.url === url)
  const request = requests.splice(index, 1)[0]
  await act(async () => request.resolve(settled(request.config, data)))
}

beforeEach(() => {
  // jsdom does not implement scrolling; the real chat components still render.
  HTMLElement.prototype.scrollIntoView = () => {}
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useAuthStore.getState().setSession('test-token', { id: 'a', name: 'Test A', email: 'a@example.invalid', created_at: '2026-01-01T00:00:00Z' }, client)
  requests = []
  sessionsData = []
  api.defaults.adapter = (config) => {
    if (config.url === '/chat/sessions' && config.method === 'get') {
      return Promise.resolve(settled(config, sessionsData))
    }
    return new Promise((resolve, reject) => requests.push({ config, resolve, reject }))
  }
})
afterEach(() => { cleanup(); client.clear(); api.defaults.adapter = originalAdapter; HTMLElement.prototype.scrollIntoView = originalScroll })

it('shows delayed history loading, then an actionable history error, and enables sends only after retry', async () => {
  const user = userEvent.setup()
  render(<QueryClientProvider client={client}><ChatPage /></QueryClientProvider>)
  expect(screen.getByRole('status')).toHaveTextContent(/loading.*history/i)
  await user.type(screen.getByLabelText('Message'), 'synthetic question')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  await waitFor(() => expect(requests.some((r) => r.config.url === '/chat/sessions/latest')).toBe(true))
  const index = requests.findIndex((r) => r.config.url === '/chat/sessions/latest')
  const request = requests.splice(index, 1)[0]
  await act(async () => request.reject(new Error('History unavailable')))
  expect(await screen.findByRole('alert')).toHaveTextContent('History unavailable')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: /retry/i }))
  await respond('/chat/sessions/latest', { session: null, messages: [] })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('starts a new chat without losing the previous conversation', async () => {
  const user = userEvent.setup()
  sessionsData = [
    { id: 'ws1', title: 'First chat', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ]
  render(<QueryClientProvider client={client}><ChatPage /></QueryClientProvider>)
  await respond('/chat/sessions/latest', {
    session: sessionsData[0],
    messages: [
      { id: 'm1', role: 'user', created_at: '2026-01-01T00:00:00Z', text: 'First question', reply: null },
      { id: 'm2', role: 'assistant', created_at: '2026-01-01T00:00:01Z', text: null, reply: { type: 'clarify', text: 'First answer', missing: [] } },
    ],
  })
  expect((await screen.findAllByText('First chat')).length).toBeGreaterThan(0)
  expect(screen.getByText('First question')).toBeInTheDocument()

  await user.click(screen.getAllByRole('button', { name: 'New chat' })[0])

  expect(screen.queryByText('First question')).not.toBeInTheDocument()
  expect(screen.getAllByText('First chat').length).toBeGreaterThan(0)

  await user.type(screen.getByLabelText('Message'), 'Second question')
  await user.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(requests.some((r) => r.config.url === '/chat')).toBe(true))
  const sendRequest = requests.find((r) => r.config.url === '/chat')!
  expect(JSON.parse(String(sendRequest.config.data)).session_id).toBeNull()
  await act(async () => sendRequest.resolve(settled(sendRequest.config, {
    message_id: 'm3', session_id: 'ws2', intent: 'rag',
    reply: { type: 'answer', text: 'Second answer', grounded: false, citations: [] },
  })))
  expect((await screen.findAllByText('Second question')).length).toBeGreaterThan(0)
  expect(screen.getAllByText('First chat').length).toBeGreaterThan(0)
})

it('clears the active conversation only after typing CLEAR to confirm', async () => {
  const user = userEvent.setup()
  sessionsData = [
    { id: 'ws1', title: 'First chat', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ]
  render(<QueryClientProvider client={client}><ChatPage /></QueryClientProvider>)
  await respond('/chat/sessions/latest', {
    session: sessionsData[0],
    messages: [
      { id: 'm1', role: 'user', created_at: '2026-01-01T00:00:00Z', text: 'Private question', reply: null },
      { id: 'm2', role: 'assistant', created_at: '2026-01-01T00:00:01Z', text: null, reply: { type: 'clarify', text: 'Private answer', missing: [] } },
    ],
  })
  expect(await screen.findByText('Private question')).toBeInTheDocument()

  await user.click(screen.getAllByRole('button', { name: 'Clear chat' })[0])
  const dialog = screen.getByRole('dialog')
  const confirm = within(dialog).getByRole('button', { name: 'Clear chat' })
  expect(confirm).toBeDisabled()
  await user.type(within(dialog).getByLabelText('Type CLEAR to confirm'), 'CLEAR')
  await user.click(confirm)

  await waitFor(() => expect(requests.some((r) => r.config.url === '/chat/sessions/ws1/messages')).toBe(true))
  const clearRequest = requests.find((r) => r.config.url === '/chat/sessions/ws1/messages')!
  await act(async () => clearRequest.resolve(settled(clearRequest.config, null, 204)))
  expect(await screen.findByText('Ask your material, or anything else')).toBeInTheDocument()
  expect(screen.getAllByText('First chat').length).toBeGreaterThan(0)
})

const sessionsFixture = [
  { id: 'ws1', title: 'First chat', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'ws2', title: 'Second chat', created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
]

const historyFixture = {
  session: sessionsFixture[1],
  messages: [
    { id: 'm1', role: 'user', created_at: '2026-01-02T00:00:00Z', text: 'Kept question', reply: null },
    { id: 'm2', role: 'assistant', created_at: '2026-01-02T00:00:01Z', text: null, reply: { type: 'clarify', text: 'Kept answer', missing: [] } },
  ],
}

async function confirmDialogAction(
  user: ReturnType<typeof userEvent.setup>,
  openLabel: string,
  typed: string,
  confirmLabel: string,
) {
  await user.click(screen.getAllByRole('button', { name: openLabel })[0])
  const dialog = screen.getByRole('dialog')
  await user.type(within(dialog).getByLabelText(`Type ${typed} to confirm`), typed)
  await user.click(within(dialog).getByRole('button', { name: confirmLabel }))
  return dialog
}

it('deletes the open conversation and leaves you on a fresh chat', async () => {
  const user = userEvent.setup()
  sessionsData = sessionsFixture
  render(<QueryClientProvider client={client}><ChatPage /></QueryClientProvider>)
  await respond('/chat/sessions/latest', {
    session: sessionsFixture[0],
    messages: [
      { id: 'm0', role: 'user', created_at: '2026-01-01T00:00:00Z', text: 'Deletable question', reply: null },
    ],
  })
  expect(await screen.findByText('Deletable question')).toBeInTheDocument()

  const dialog = await confirmDialogAction(user, 'Delete First chat', 'DELETE', 'Delete conversation')

  await waitFor(() => expect(requests.some((r) => r.config.url === '/chat/sessions/ws1' && r.config.method === 'delete')).toBe(true))
  const request = requests.find((r) => r.config.url === '/chat/sessions/ws1')!
  await act(async () => request.resolve(settled(request.config, null, 204)))

  expect(await screen.findByText('Ask your material, or anything else')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByText('First chat')).not.toBeInTheDocument()
  expect(screen.getAllByText('Second chat').length).toBeGreaterThan(0)
  expect(dialog).not.toBeInTheDocument()
})

it('deletes an inactive conversation without touching the open one', async () => {
  const user = userEvent.setup()
  sessionsData = sessionsFixture
  render(<QueryClientProvider client={client}><ChatPage /></QueryClientProvider>)
  await respond('/chat/sessions/latest', historyFixture)
  expect(await screen.findByText('Kept question')).toBeInTheDocument()

  await confirmDialogAction(user, 'Delete First chat', 'DELETE', 'Delete conversation')
  await waitFor(() => expect(requests.some((r) => r.config.url === '/chat/sessions/ws1')).toBe(true))
  const request = requests.find((r) => r.config.url === '/chat/sessions/ws1')!
  await act(async () => request.resolve(settled(request.config, null, 204)))

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByText('Kept question')).toBeInTheDocument()
  expect(screen.queryByText('First chat')).not.toBeInTheDocument()
  expect(screen.getAllByText('Second chat').length).toBeGreaterThan(0)
})

it('deletes every conversation after typing DELETE ALL', async () => {
  const user = userEvent.setup()
  sessionsData = sessionsFixture
  render(<QueryClientProvider client={client}><ChatPage /></QueryClientProvider>)
  await respond('/chat/sessions/latest', historyFixture)
  expect(await screen.findByText('Kept question')).toBeInTheDocument()

  const dialog = await confirmDialogAction(user, 'Delete all chats', 'DELETE ALL', 'Delete all chats')

  await waitFor(() => expect(requests.some((r) => r.config.url === '/chat/sessions' && r.config.method === 'delete')).toBe(true))
  const request = requests.find((r) => r.config.url === '/chat/sessions')!
  await act(async () => request.resolve(settled(request.config, null, 204)))

  expect(await screen.findByText('No conversations yet. Send a message to start one.')).toBeInTheDocument()
  expect(screen.getByText('Ask your material, or anything else')).toBeInTheDocument()
  expect(screen.queryByText('Kept question')).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(dialog).not.toBeInTheDocument()
})

it('cancelling keeps the conversation and sends no request', async () => {
  const user = userEvent.setup()
  sessionsData = sessionsFixture
  render(<QueryClientProvider client={client}><ChatPage /></QueryClientProvider>)
  await respond('/chat/sessions/latest', historyFixture)
  expect(await screen.findByText('Kept question')).toBeInTheDocument()

  await user.click(screen.getAllByRole('button', { name: 'Delete First chat' })[0])
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(requests.some((r) => r.config.method === 'delete')).toBe(false)
  expect(screen.getAllByText('First chat').length).toBeGreaterThan(0)
  expect(screen.getByText('Kept question')).toBeInTheDocument()
})
