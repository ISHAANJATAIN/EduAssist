import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { UserOut } from '@/api/auth'

interface AuthState {
  token: string | null
  user: UserOut | null
  setSession: (token: string, user: UserOut) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'eduassist-auth' },
  ),
)
