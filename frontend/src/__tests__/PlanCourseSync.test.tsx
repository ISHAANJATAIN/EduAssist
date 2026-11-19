import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import { api } from '@/api/client'
import { useCourse } from '@/hooks/useCourse'
import { useCreatePlan } from '@/hooks/usePlan'
import { useAuthStore } from '@/store/authStore'

const course = { id: 'course-test', name: 'Operating Systems', exam_date: '2026-11-22', free_hours_per_day: 6 }
const rebuiltCourse = { ...course, exam_date: '2026-11-29' }
const plan = { id: 'plan-a', exam_date: '2026-11-29', feasible: true, days: [], notes: [] }
const account = { id: 'a', name: 'Test A', email: 'a@example.invalid', created_at: '2026-01-01T00:00:00Z' }
const originalAdapter = api.defaults.adapter
let client: QueryClient
let courseReads = 0
const requests: { config: InternalAxiosRequestConfig; resolve: (response: AxiosResponse) => void }[] = []

function ok(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return { config, data, status: 200, statusText: 'OK', headers: {} }
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useAuthStore.getState().setSession('a-token', account, client)
  requests.length = 0
  courseReads = 0
  api.defaults.adapter = (config) => {
    if (config.method === 'get' && config.url === '/course') {
      courseReads += 1
      return Promise.resolve(ok(config, courseReads === 1 ? course : rebuiltCourse))
    }
    return new Promise((resolve) => requests.push({ config, resolve }))
  }
})

afterEach(() => {
  cleanup()
  client.clear()
  api.defaults.adapter = originalAdapter
})

describe('plan creation and the shared exam date', () => {
  it('refetches the course so the header pill follows a rebuilt plan', async () => {
    const courseHook = renderHook(() => useCourse(), { wrapper })
    await waitFor(() => expect(courseHook.result.current.data?.exam_date).toBe('2026-11-22'))

    const planHook = renderHook(() => useCreatePlan(), { wrapper })
    act(() => planHook.result.current.mutate({ exam_date: '2026-11-29' }))
    await waitFor(() => expect(requests).toHaveLength(1))

    await act(async () => {
      const request = requests.shift()!
      request.resolve(ok(request.config, plan))
    })

    await waitFor(() => expect(courseHook.result.current.data?.exam_date).toBe('2026-11-29'))
    expect(courseReads).toBe(2)
  })
})
