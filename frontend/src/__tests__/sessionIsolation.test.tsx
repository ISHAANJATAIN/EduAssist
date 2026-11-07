import { StrictMode, useState, type PropsWithChildren } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import { api } from '@/api/client'
import { queryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useAuth } from '@/hooks/useAuth'
import { useChat } from '@/hooks/useChat'
import { planKey, useCreatePlan } from '@/hooks/usePlan'
import { courseKey, useCourse, useUpdateCourse } from '@/hooks/useCourse'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { topicsKey, useCreateTopic, useUpdateTopic, useDeleteTopic, useExtractTopics } from '@/hooks/useTopics'
import { documentsKey, useUploadDocument, useDeleteDocument } from '@/hooks/useDocuments'
import { useSubmitAttempt } from '@/hooks/useQuiz'

const userA = { id: 'a', name: 'Test A', email: 'a@example.invalid', created_at: '2026-01-01T00:00:00Z' }
const userB = { ...userA, id: 'b', name: 'Test B', email: 'b@example.invalid' }
const plan = { id: 'plan-a', exam_date: '2026-12-01', feasible: true, days: [], notes: [] }
const course = { id: 'course-a', name: 'A course', exam_date: null, free_hours_per_day: 2 }
const topic = { id: 'topic-a', name: 'A topic', description: null, prerequisite_ids: [] }
const reply = { message_id: 'reply-a', intent: 'planner', reply: { type: 'plan', plan } }
const originalAdapter = api.defaults.adapter
const requests: { config: InternalAxiosRequestConfig; resolve: (value: AxiosResponse) => void; reject: (cause: unknown) => void }[] = []

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
}
function strictWrapper({ children }: PropsWithChildren) {
  return <StrictMode>{wrapper({ children })}</StrictMode>
}
function protectedWrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Private route</div>} />
          </Route>
        </Routes>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  )
}
async function respond(url: string, data: unknown) {
  await waitFor(() => expect(requests.some((request) => request.config.url === url)).toBe(true))
  const index = requests.findIndex((request) => request.config.url === url)
  const request = requests.splice(index, 1)[0]
  await act(async () => request.resolve({ config: request.config, data, status: 200, statusText: 'OK', headers: {} }))
}

beforeEach(() => {
  queryClient.clear()
  queryClient.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } })
  useChatStore.getState().reset()
  useAuthStore.getState().setSession('a-token', userA)
  requests.length = 0
  api.defaults.adapter = (config) => new Promise((resolve, reject) => requests.push({ config, resolve, reject }))
})
afterEach(() => { cleanup(); queryClient.clear(); api.defaults.adapter = originalAdapter })

describe('account transitions', () => {
  it.each(['logout', 'replacement'] as const)('%s clears chat and cached private data', (transition) => {
    useChatStore.getState().appendUser('A private message')
    queryClient.setQueryData(planKey, plan)
    if (transition === 'logout') useAuthStore.getState().logout()
    else useAuthStore.getState().setSession('b-token', userB)
    expect(useChatStore.getState().messages).toEqual([])
    expect(queryClient.getQueryData(planKey)).toBeUndefined()
  })

  it.each(['login', 'register'] as const)('%s replaces account without retaining private data', async (action) => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    useChatStore.getState().appendUser('A private message')
    queryClient.setQueryData(planKey, plan)
    act(() => result.current[action].mutate({ email: 'b@example.invalid', password: 'synthetic-only', name: 'Test B' }))
    await respond(`/auth/${action}`, { access_token: 'b-token', token_type: 'bearer', user: userB })
    await waitFor(() => expect(useAuthStore.getState().token).toBe('b-token'))
    expect(useChatStore.getState().messages).toEqual([])
    expect(queryClient.getQueryData(planKey)).toBeUndefined()
  })

  it('ignores a pending login after logout', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    act(() => result.current.login.mutate({ email: 'a@example.invalid', password: 'synthetic-only' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    act(() => useAuthStore.getState().logout())
    await respond('/auth/login', { access_token: 'a-token', token_type: 'bearer', user: userA })
    await waitFor(() => expect(result.current.login.isPending).toBe(false))
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('ignores an earlier login when a newer registration is already pending', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    act(() => result.current.login.mutate({ email: 'a@example.invalid', password: 'synthetic-only' }))
    act(() => result.current.register.mutate({ email: 'b@example.invalid', password: 'synthetic-only', name: 'Test B' }))
    await waitFor(() => expect(requests).toHaveLength(2))
    await respond('/auth/login', { access_token: 'old-token', token_type: 'bearer', user: userA })
    await waitFor(() => expect(result.current.login.isPending).toBe(false))
    expect(useAuthStore.getState().token).toBe('a-token')
    await respond('/auth/register', { access_token: 'b-token', token_type: 'bearer', user: userB })
    await waitFor(() => expect(useAuthStore.getState().token).toBe('b-token'))
  })
})

describe('authentication hook lifetime', () => {
  it.each([
    ['login', 'register', wrapper], ['register', 'login', wrapper],
    ['login', 'register', strictWrapper], ['register', 'login', strictWrapper],
  ] as const)('unmounted %s cannot supersede the new %s hook (%#)', async (abandoned, current, authWrapper) => {
    const oldRoute = renderHook(() => useAuth(), { wrapper: authWrapper })
    act(() => oldRoute.result.current[abandoned].mutate({ email: 'a@example.invalid', password: 'synthetic-only', name: 'Test A' }))
    await waitFor(() => expect(requests).toHaveLength(1))
    const oldMutation = queryClient.getMutationCache().getAll()[0]
    oldRoute.unmount()

    const newRoute = renderHook(() => useAuth(), { wrapper: authWrapper })
    act(() => newRoute.result.current[current].mutate({ email: 'b@example.invalid', password: 'synthetic-only', name: 'Test B' }))
    await waitFor(() => expect(requests).toHaveLength(2))
    await respond(`/auth/${abandoned}`, { access_token: 'old-token', token_type: 'bearer', user: userA })
    await waitFor(() => expect(oldMutation.state.status).toBe('success'))
    await respond(`/auth/${current}`, { access_token: 'b-token', token_type: 'bearer', user: userB })
    await waitFor(() => expect(newRoute.result.current[current].isPending).toBe(false))
    expect(useAuthStore.getState().token).toBe('b-token')
    expect(useAuthStore.getState().user).toEqual(userB)
  })

  it.each(['login', 'register'] as const)('mounted StrictMode %s still installs the session', async (action) => {
    const { result } = renderHook(() => useAuth(), { wrapper: strictWrapper })
    act(() => result.current[action].mutate({ email: 'b@example.invalid', password: 'synthetic-only', name: 'Test B' }))
    await respond(`/auth/${action}`, { access_token: 'b-token', token_type: 'bearer', user: userB })
    await waitFor(() => expect(useAuthStore.getState().token).toBe('b-token'))
  })
})

describe('same-session authentication hydration', () => {
  it('hydrateSession refreshes only the current user without resetting private data', () => {
    const generation = useAuthStore.getState().generation
    useChatStore.getState().appendUser('Current session message')
    queryClient.setQueryData(planKey, plan)
    const hydratedUser = { ...userA, name: 'Hydrated A' }
    useAuthStore.getState().hydrateSession('a-token', hydratedUser, generation)
    expect(useAuthStore.getState().user).toEqual(hydratedUser)
    expect(useAuthStore.getState().token).toBe('a-token')
    expect(useAuthStore.getState().generation).toBe(generation)
    expect(queryClient.getQueryData(planKey)).toEqual(plan)
    expect(useChatStore.getState().messages.map((message) => message.text)).toEqual(['Current session message'])
  })

  it.each(['token mismatch', 'generation mismatch', 'logout'] as const)('hydrateSession rejects %s provenance', (mismatch) => {
    const generation = useAuthStore.getState().generation
    if (mismatch === 'logout') useAuthStore.getState().logout()
    useAuthStore.getState().hydrateSession(mismatch === 'token mismatch' ? 'other-token' : 'a-token', userB, mismatch === 'generation mismatch' ? generation - 1 : generation)
    expect(useAuthStore.getState().user).toEqual(mismatch === 'logout' ? null : userA)
    expect(useAuthStore.getState().token).toBe(mismatch === 'logout' ? null : 'a-token')
  })

  it('/auth/me completing while /course is pending keeps the course result observed', async () => {
    const { result } = renderHook(() => useCourse(), { wrapper: protectedWrapper })
    await waitFor(() => expect(requests).toHaveLength(2))
    useChatStore.getState().appendUser('Current session message')
    queryClient.setQueryData(planKey, plan)
    const generation = useAuthStore.getState().generation
    const hydratedUser = { ...userA, name: 'Hydrated A' }

    await respond('/auth/me', hydratedUser)
    await waitFor(() => expect(useAuthStore.getState().user).toEqual(hydratedUser))
    await respond('/course', course)
    await waitFor(() => expect(result.current.data).toEqual(course))
    expect(useAuthStore.getState().generation).toBe(generation)
    expect(queryClient.getQueryData(planKey)).toEqual(plan)
    expect(useChatStore.getState().messages.map((message) => message.text)).toEqual(['Current session message'])
  })

  it.each(['token replacement', 'same-token replacement', 'privacy reset'] as const)('%s starts fresh auth/me and ignores the old result', async (transition) => {
    renderHook(() => null, { wrapper: protectedWrapper })
    await waitFor(() => expect(requests).toHaveLength(1))
    act(() => {
      if (transition === 'privacy reset') useAuthStore.getState().resetData()
      else useAuthStore.getState().setSession(transition === 'token replacement' ? 'b-token' : 'a-token', userB)
    })
    await waitFor(() => expect(requests).toHaveLength(2))
    await respond('/auth/me', { ...userA, name: 'Obsolete A' })
    expect(useAuthStore.getState().user).toEqual(transition === 'privacy reset' ? userA : userB)
    await respond('/auth/me', userB)
    await waitFor(() => expect(useAuthStore.getState().user).toEqual(userB))
  })
})

describe('history hydration', () => {
  it('blocks sends until delayed history succeeds, then preserves history and new messages', async () => {
    const { result } = renderHook(() => useChat(), { wrapper })
    await waitFor(() => expect(requests).toHaveLength(1))
    act(() => result.current.send('too early'))
    await act(async () => { await Promise.resolve() })
    expect(useChatStore.getState().messages).toEqual([])
    expect(requests.map((r) => r.config.url)).toEqual(['/chat/history'])
    await respond('/chat/history', [{ id: 'old', role: 'user', created_at: '2026-01-01T00:00:00Z', text: 'history', reply: null }])
    await waitFor(() => expect(useChatStore.getState().hydrated).toBe(true))
    act(() => result.current.send('new message'))
    await respond('/chat', reply)
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['old', expect.stringMatching(/^local-/), 'reply-a'])
    expect(queryClient.getQueryData(planKey)).toEqual({ id: 'plan-a', exam_date: '2026-12-01', feasible: true, days: [], notes: [] })
  })

  it('history failure blocks sends until retry succeeds', async () => {
    const { result } = renderHook(() => useChat(), { wrapper })
    await waitFor(() => expect(requests).toHaveLength(1))
    const request = requests.shift()!
    await act(async () => request.reject(new Error('history failed')))
    await waitFor(() => expect(result.current.historyError).toBeTruthy())
    act(() => result.current.send('blocked'))
    await act(async () => { await Promise.resolve() })
    expect(useChatStore.getState().messages).toEqual([])
    expect(requests).toHaveLength(0)
    act(() => result.current.retryHistory())
    await respond('/chat/history', [])
    await waitFor(() => expect(result.current.canSend).toBe(true))
    expect(result.current.historyError).toBeNull()
  })

  it('late A history cannot hydrate chat after B login', async () => {
    const { result } = renderHook(() => useChat(), { wrapper })
    await waitFor(() => expect(requests).toHaveLength(1))
    act(() => useAuthStore.getState().setSession('b-token', userB))
    await respond('/chat/history', [{ id: 'a-history', role: 'user', created_at: '2026-01-01T00:00:00Z', text: 'A secret', reply: null }])
    await act(async () => { await Promise.resolve() })
    expect(result.current.messages).toEqual([])
    expect(useChatStore.getState().hydrated).toBe(false)
  })
})

describe('deferred data mutations', () => {
  it.each(['mutate', 'mutateAsync'] as const)('current %s attempt callbacks still update consumer state', async (method) => {
    const { result } = renderHook(() => {
      const mutation = useSubmitAttempt()
      const [attemptId, setAttemptId] = useState<string | null>(null)
      const [settled, setSettled] = useState(false)
      const submit = () => mutation[method]({ quizId: 'quiz-a', payload: { answers: [] } }, {
        onSuccess: (attempt) => setAttemptId(attempt.attempt_id),
        onSettled: () => setSettled(true),
      })
      return { submit, attemptId, settled }
    }, { wrapper })
    queryClient.setQueryData(['performance'], [])
    queryClient.setQueryData(['recommendations'], [])
    act(() => { void result.current.submit() })
    await respond('/quizzes/quiz-a/attempts', { attempt_id: 'attempt-a', score_percent: 0, correct_count: 0, total: 0, results: [], mastery_updates: [], recommendations: [] })
    await waitFor(() => expect(result.current.attemptId).toBe('attempt-a'))
    expect(result.current.settled).toBe(true)
    expect(queryClient.getQueryState(['performance'])?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(['recommendations'])?.isInvalidated).toBe(true)
  })

  it.each([
    ['logout', 'mutate'], ['replacement', 'mutate'], ['privacy', 'mutate'],
    ['logout', 'mutateAsync'], ['replacement', 'mutateAsync'], ['privacy', 'mutateAsync'],
  ] as const)('late attempt after %s cannot run %s consumer callbacks', async (transition, method) => {
    const { result } = renderHook(() => {
      const mutation = useSubmitAttempt()
      const [attemptId, setAttemptId] = useState<string | null>(null)
      const submit = () => mutation[method]({ quizId: 'quiz-a', payload: { answers: [] } }, {
        onSuccess: (attempt) => setAttemptId(attempt.attempt_id),
      })
      return { submit, attemptId, pending: mutation.isPending }
    }, { wrapper })
    act(() => { void result.current.submit() })
    await waitFor(() => expect(requests).toHaveLength(1))
    act(() => {
      if (transition === 'logout') useAuthStore.getState().logout()
      else if (transition === 'replacement') useAuthStore.getState().setSession('b-token', userB)
      else useAuthStore.getState().resetData()
    })
    await respond('/quizzes/quiz-a/attempts', { attempt_id: 'attempt-a', score_percent: 0, correct_count: 0, total: 0, results: [], mastery_updates: [], recommendations: [] })
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.attemptId).toBeNull()
  })

  it('late attempt error cannot run consumer error or settled state callbacks', async () => {
    const { result } = renderHook(() => {
      const mutation = useSubmitAttempt()
      const [error, setError] = useState<unknown>(null)
      const [settled, setSettled] = useState(false)
      const submit = () => mutation.mutate({ quizId: 'quiz-a', payload: { answers: [] } }, {
        onError: setError, onSettled: () => setSettled(true),
      })
      return { submit, error, settled, pending: mutation.isPending }
    }, { wrapper })
    act(() => { void result.current.submit() })
    await waitFor(() => expect(requests).toHaveLength(1))
    act(() => useAuthStore.getState().setSession('b-token', userB))
    await act(async () => requests[0].reject(new Error('A attempt failed')))
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.settled).toBe(false)
  })

  it.each(['logout', 'replacement'] as const)('late chat reply cannot restore A data after %s', async (transition) => {
    const { result } = renderHook(() => useChat(), { wrapper })
    await respond('/chat/history', [])
    await waitFor(() => expect(useChatStore.getState().hydrated).toBe(true))
    act(() => result.current.send('Build my plan', 'planner'))
    await waitFor(() => expect(requests.some((r) => r.config.url === '/chat')).toBe(true))
    act(() => {
      if (transition === 'logout') useAuthStore.getState().logout()
      else useAuthStore.getState().setSession('b-token', userB)
      // Simulate the existing logout/reset path. clear() alone does not cancel callbacks.
      useChatStore.getState().reset()
      queryClient.clear()
    })
    await respond('/chat', reply)
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(useChatStore.getState().messages).toEqual([])
    expect(queryClient.getQueryData(planKey)).toBeUndefined()
  })

  it('B can send after hydration without waiting for A pending request', async () => {
    const { result } = renderHook(() => useChat(), { wrapper })
    await respond('/chat/history', [])
    await waitFor(() => expect(useChatStore.getState().hydrated).toBe(true))
    act(() => result.current.send('A private message'))
    await waitFor(() => expect(requests.some((r) => r.config.url === '/chat')).toBe(true))
    act(() => useAuthStore.getState().setSession('b-token', userB))
    await respond('/chat/history', [])
    await waitFor(() => expect(useChatStore.getState().hydrated).toBe(true))
    expect(result.current.canSend).toBe(true)
    act(() => result.current.send('B private message'))
    await waitFor(() => expect(requests.filter((r) => r.config.url === '/chat')).toHaveLength(2))
    await respond('/chat', reply)
    expect(useChatStore.getState().pending).toBe(true)
    expect(useChatStore.getState().messages.map((m) => m.text)).toEqual(['B private message'])
    await respond('/chat', { message_id: 'reply-b', intent: 'clarify', reply: { type: 'clarify', text: 'B response', missing: [] } })
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual([expect.stringMatching(/^local-/), 'reply-b'])
  })

  it.each(['replacement', 'privacy'] as const)('an obsolete retry callback cannot resend old messages after %s', async (transition) => {
    const { result } = renderHook(() => useChat(), { wrapper })
    await respond('/chat/history', [])
    await waitFor(() => expect(useChatStore.getState().hydrated).toBe(true))
    act(() => result.current.send('old private message'))
    await waitFor(() => expect(requests).toHaveLength(1))
    const failed = requests.shift()!
    await act(async () => failed.reject(new Error('Try again')))
    await waitFor(() => expect(result.current.error).toBeTruthy())
    const obsoleteRetry = result.current.retry
    act(() => {
      if (transition === 'replacement') useAuthStore.getState().setSession('b-token', userB)
      else useAuthStore.getState().resetData()
    })
    await respond('/chat/history', [])
    await waitFor(() => expect(useChatStore.getState().hydrated).toBe(true))
    act(() => obsoleteRetry())
    await act(async () => { await Promise.resolve() })
    expect(requests).toHaveLength(0)
    expect(useChatStore.getState().messages).toEqual([])
  })

  it('late chat error cannot overwrite the new session error/pending state', async () => {
    const { result } = renderHook(() => useChat(), { wrapper })
    await respond('/chat/history', [])
    await waitFor(() => expect(useChatStore.getState().hydrated).toBe(true))
    act(() => result.current.send('A message'))
    await waitFor(() => expect(requests.some((r) => r.config.url === '/chat')).toBe(true))
    act(() => { useAuthStore.getState().setSession('b-token', userB); useChatStore.getState().setPending(true) })
    const request = requests.find((r) => r.config.url === '/chat')!
    await act(async () => request.reject(new Error('A failure')))
    await waitFor(() => expect(result.current.canRetry).toBe(false))
    expect(useChatStore.getState().pending).toBe(true)
    expect(useChatStore.getState().error).toBeNull()
  })

  it.each([
    ['plan', '/plans', planKey, plan],
    ['course', '/course', courseKey, course],
    ['extract', '/topics/extract', topicsKey, [topic]],
  ] as const)('late %s response cannot recreate cleared cache', async (kind, url, key, data) => {
    const { result } = renderHook(() => ({ plan: useCreatePlan(), course: useUpdateCourse(), extract: useExtractTopics() }), { wrapper })
    act(() => {
      if (kind === 'plan') result.current.plan.mutate({ exam_date: '2026-12-01', free_hours_per_day: 2 })
      else if (kind === 'course') result.current.course.mutate({ name: 'A course', free_hours_per_day: 2, exam_date: null })
      else result.current.extract.mutate()
    })
    await waitFor(() => expect(requests).toHaveLength(1))
    act(() => { useAuthStore.getState().setSession('b-token', userB); queryClient.clear() })
    await respond(url, data)
    await waitFor(() => expect(result.current[kind].isPending).toBe(false))
    expect(queryClient.getQueryData(key)).toBeUndefined()
  })

  it.each(['createTopic', 'updateTopic', 'deleteTopic', 'upload', 'deleteDocument', 'attempt'] as const)('late %s cannot invalidate B cache', async (kind) => {
    const { result } = renderHook(() => ({ createTopic: useCreateTopic(), updateTopic: useUpdateTopic(), deleteTopic: useDeleteTopic(), upload: useUploadDocument(), deleteDocument: useDeleteDocument(), attempt: useSubmitAttempt() }), { wrapper })
    act(() => {
      if (kind === 'createTopic') result.current.createTopic.mutate({ name: 'A topic', description: null, prerequisite_ids: [] })
      else if (kind === 'updateTopic') result.current.updateTopic.mutate({ topicId: 'topic-a', payload: { name: 'A topic', description: null, prerequisite_ids: [] } })
      else if (kind === 'deleteTopic') result.current.deleteTopic.mutate('topic-a')
      else if (kind === 'upload') result.current.upload.mutate({ file: new File(['synthetic'], 'test.pdf', { type: 'application/pdf' }), docType: 'notes' })
      else if (kind === 'deleteDocument') result.current.deleteDocument.mutate('doc-a')
      else result.current.attempt.mutate({ quizId: 'quiz-a', payload: { answers: [] } })
    })
    await waitFor(() => expect(requests).toHaveLength(1))
    const url = requests[0].config.url!
    act(() => {
      useAuthStore.getState().setSession('b-token', userB)
      queryClient.clear()
      for (const key of [topicsKey, documentsKey, ['performance'], ['recommendations']]) queryClient.setQueryData(key, [])
    })
    const data = kind.endsWith('Topic') && kind !== 'deleteTopic' ? topic
      : kind === 'upload' ? { id: 'doc-a', filename: 'test.pdf', doc_type: 'notes', status: 'ready', page_count: 1, chunk_count: 1, error: null, uploaded_at: '2026-01-01T00:00:00Z' }
      : kind === 'attempt' ? { attempt_id: 'attempt-a', score_percent: 0, correct_count: 0, total: 0, results: [], mastery_updates: [], recommendations: [] }
      : undefined
    await respond(url, data)
    await waitFor(() => expect(result.current[kind].isPending).toBe(false))
    for (const key of [topicsKey, documentsKey, ['performance'], ['recommendations']]) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false)
  })
})
