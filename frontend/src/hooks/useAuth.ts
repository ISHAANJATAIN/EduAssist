import { useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import {
  login as loginRequest,
  register as registerRequest,
  type LoginIn,
  type RegisterIn,
} from '@/api/auth'
import { captureSessionGeneration, isCurrentSession, useAuthStore } from '@/store/authStore'

export function useAuth() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const attempt = useRef(0)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // Invalidate this lifetime's attempts, including StrictMode effect replay.
      attempt.current += 1
    }
  }, [])
  const onMutate = () => ({ generation: captureSessionGeneration(), attempt: ++attempt.current })
  const setSession = useAuthStore((state) => state.setSession)
  const clearSession = useAuthStore((state) => state.logout)

  const login = useMutation({
    mutationFn: (payload: LoginIn) => loginRequest(payload),
    onMutate,
    onSuccess: (data, _variables, context) => {
      if (!mounted.current || !isCurrentSession(context?.generation) || context?.attempt !== attempt.current) return
      setSession(data.access_token, data.user, queryClient)
      navigate('/chat', { replace: true })
    },
  })

  const register = useMutation({
    mutationFn: (payload: RegisterIn) => registerRequest(payload),
    onMutate,
    onSuccess: (data, _variables, context) => {
      if (!mounted.current || !isCurrentSession(context?.generation) || context?.attempt !== attempt.current) return
      setSession(data.access_token, data.user, queryClient)
      navigate('/chat', { replace: true })
    },
  })

  const logout = () => {
    clearSession(queryClient)
    navigate('/login', { replace: true })
  }

  return { login, register, logout }
}
