import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'

import { me } from '@/api/auth'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/store/authStore'

export function ProtectedRoute() {
  const token = useAuthStore((state) => state.token)
  const setSession = useAuthStore((state) => state.setSession)

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: me,
    enabled: Boolean(token),
    retry: false,
  })

  useEffect(() => {
    if (token && query.data) setSession(token, query.data)
  }, [token, query.data, setSession])

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
