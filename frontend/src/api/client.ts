import axios, { type AxiosError } from 'axios'

import { useAuthStore } from '@/store/authStore'

export interface ApiError {
  detail: string
  code: string
}

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ApiError>
  return (
    typeof candidate.detail === 'string' && typeof candidate.code === 'string'
  )
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export const api = axios.create({ baseURL: API_BASE_URL })

function isPublicAuthRoute(url?: string) {
  return /(?:^|\/)auth\/(?:login|register)\/?(?:[?#].*)?$/.test(url ?? '')
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (isPublicAuthRoute(config.url)) config.headers.delete('Authorization')
  else if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    const token = useAuthStore.getState().token
    const config = error.config ?? error.response?.config
    if (
      error.response?.status === 401 &&
      !isPublicAuthRoute(config?.url) &&
      token &&
      config?.headers.Authorization === `Bearer ${token}`
    ) {
      useAuthStore.getState().logout()
      if (import.meta.env.MODE !== 'test' && window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }
    return Promise.reject(normalizeError(error))
  },
)

export function normalizeError(error: unknown): ApiError {
  if (isApiError(error)) return error
  if (axios.isAxiosError<ApiError>(error)) {
    const data = error.response?.data
    if (data && typeof data.detail === 'string' && typeof data.code === 'string') {
      return data
    }
    if (!error.response) {
      return {
        detail: 'Cannot reach the server. Is the API running?',
        code: 'network_error',
      }
    }
    return { detail: error.message, code: 'request_failed' }
  }
  if (error instanceof Error) {
    return { detail: error.message, code: 'unknown_error' }
  }
  return { detail: 'Something went wrong.', code: 'unknown_error' }
}
