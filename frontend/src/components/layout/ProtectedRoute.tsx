import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'

import { me } from '@/api/auth'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/store/authStore'

export function ProtectedRoute() {
  const token = useAuthStore((state) => state.token)
  const generation = useAuthStore((state) => state.generation)
  const hydrateSession = useAuthStore((state) => state.hydrateSession)

  const query = useQuery({
    queryKey: ['auth', 'me', token, generation],
    queryFn: async () => ({ user: await me(), token, generation }),
    enabled: Boolean(token),
    retry: false,
  })

  useEffect(() => {
    const session = query.data
    if (session?.token) hydrateSession(session.token, session.user, session.generation)
  }, [query.data, hydrateSession])

  if (!token) return <Navigate to="/login" replace />

  if (query.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (query.isError) return <Navigate to="/login" replace />

  return <Outlet />
}
