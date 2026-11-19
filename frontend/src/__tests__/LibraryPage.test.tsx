import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'

import { api } from '@/api/client'
import { LibraryPage } from '@/pages/LibraryPage'
import { useAuthStore } from '@/store/authStore'

const account = {
  id: 'a',
  name: 'Test A',
  email: 'a@example.invalid',
  created_at: '2026-01-01T00:00:00Z',
}

const document = {
  id: 'doc-1',
  filename: 'notes.txt',
  doc_type: 'notes' as const,
  status: 'ready' as const,
  page_count: 1,
  chunk_count: 2,
  error: null,
  uploaded_at: '2026-11-01T00:00:00Z',
}

const topic = {
  id: 'topic-1',
  name: 'Deadlocks',
  description: null,
  prerequisite_ids: [],
}

let client: QueryClient
let documents: (typeof document)[] = []
let topics: (typeof topic)[] = []
let deleted: string[] = []
const originalAdapter = api.defaults.adapter

function reply(
  config: InternalAxiosRequestConfig,
  data: unknown,
  status = 200,
) {
  return Promise.resolve({
    config,
    data,
    status,
    statusText: 'OK',
    headers: {},
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={client}>
      <LibraryPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useAuthStore.getState().setSession('a-token', account, client)
  documents = [{ ...document }]
  topics = [{ ...topic }]
  deleted = []
  api.defaults.adapter = (config) => {
    const method = config.method?.toLowerCase()
    if (method === 'get' && config.url === '/documents') {
      return reply(config, documents)
    }
    if (method === 'get' && config.url === '/topics') {
      return reply(config, topics)
    }
    if (method === 'delete' && config.url === '/documents') {
      deleted.push('/documents')
      documents = []
      return reply(config, undefined, 204)
    }
    if (method === 'delete' && config.url === '/topics') {
      deleted.push('/topics')
      topics = []
      return reply(config, undefined, 204)
    }
    return Promise.reject(
      new Error(`Unexpected request ${method} ${config.url}`),
    )
  }
})

afterEach(() => {
  cleanup()
  client.clear()
  api.defaults.adapter = originalAdapter
  useAuthStore.setState({ token: null, user: null })
})

describe('LibraryPage delete all', () => {
  it('hides delete-all actions when there is nothing to delete', async () => {
    documents = []
    topics = []
    renderPage()

    expect(
      await screen.findByText('No material yet. Upload your first file above.'),
    ).toBeInTheDocument()
    expect(await screen.findByText(/no topics yet/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete all documents' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete all topics' }),
    ).not.toBeInTheDocument()
  })

  it('deletes all documents after the typed confirmation matches in any case', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('notes.txt')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Delete all documents' }),
    )

    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', {
      name: 'Delete all documents',
    })
    expect(confirm).toBeDisabled()

    await user.type(
      within(dialog).getByLabelText('Type DELETE ALL DOCUMENTS to confirm'),
      'delete all documents',
    )
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    await waitFor(() => expect(deleted).toEqual(['/documents']))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(
      await screen.findByText('No material yet. Upload your first file above.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Deadlocks')).toBeInTheDocument()
  })

  it('deletes all topics after the typed confirmation matches in any case', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('Deadlocks')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete all topics' }))

    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', {
      name: 'Delete all topics',
    })
    expect(confirm).toBeDisabled()

    await user.type(
      within(dialog).getByLabelText('Type DELETE ALL TOPICS to confirm'),
      'Delete All Topics',
    )
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    await waitFor(() => expect(deleted).toEqual(['/topics']))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(await screen.findByText(/no topics yet/i)).toBeInTheDocument()
    expect(screen.getByText('notes.txt')).toBeInTheDocument()
  })
})
