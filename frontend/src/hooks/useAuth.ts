import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import {
  login as loginRequest,
  register as registerRequest,
  type LoginIn,
  type RegisterIn,
} from '@/api/auth'
import { queryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'

export function useAuth() {
  const navigate = useNavigate()
  const setSession = useAuthStore((state) => state.setSession)
  const clearSession = useAuthStore((state) => state.logout)

  const login = useMutation({
    mutationFn: (payload: LoginIn) => loginRequest(payload),
    onSuccess: (data) => {
      setSession(data.access_token, data.user)
      navigate('/', { replace: true })
    },
  })

  const register = useMutation({
    mutationFn: (payload: RegisterIn) => registerRequest(payload),
    onSuccess: (data) => {
      setSession(data.access_token, data.user)
      navigate('/', { replace: true })
    },
  })

  const logout = () => {
    clearSession()
    useChatStore.getState().reset()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return { login, register, logout }
}
