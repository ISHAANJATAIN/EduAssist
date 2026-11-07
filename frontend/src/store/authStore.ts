import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { QueryClient } from '@tanstack/react-query'

import type { UserOut } from '@/api/auth'
import { queryClient } from '@/lib/queryClient'
import { useChatStore } from '@/store/chatStore'

interface AuthState {
  token: string | null
  user: UserOut | null
  generation: number
  resetData: (client?: QueryClient) => number
  setSession: (token: string, user: UserOut, client?: QueryClient) => void
  hydrateSession: (token: string, user: UserOut, generation: number) => void
  logout: (client?: QueryClient) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      generation: 0,
      resetData: (client = queryClient) => {
        const generation = get().generation + 1
        // Invalidate callbacks before clearing stores: pending mutations survive clear().
        set({ generation })
        useChatStore.getState().reset()
        client.clear()
        return generation
      },
      setSession: (token, user, client) => {
        get().resetData(client)
        set({ token, user })
      },
      hydrateSession: (token, user, generation) => {
        if (token !== get().token || generation !== get().generation) return
        set({ user })
      },
      logout: (client) => {
        get().resetData(client)
        set({ token: null, user: null })
      },
    }),
    {
      name: 'eduassist-auth',
      partialize: ({ token, user }) => ({ token, user }),
    },
  ),
)

export const captureSessionGeneration = () => useAuthStore.getState().generation
export const isCurrentSession = (generation: number | undefined) =>
  generation === useAuthStore.getState().generation
