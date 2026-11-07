import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const { login } = useAuth()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    login.mutate({
      email: String(data.get('email')),
      password: String(data.get('password')),
    })
  }

  return (
    <AuthLayout>
      <h2 className="text-[28px] font-semibold leading-tight text-ink">Sign in</h2>
      <p className="mt-1 text-base text-neutral-600">Welcome back to your course.</p>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="field-input"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="field-input"
            placeholder="••••••••"
          />
        </div>

        {login.error ? <ErrorBanner error={login.error} /> : null}

        <Button type="submit" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-600">
        New here?{' '}
        <Link
          to="/register"
          className="font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition hover:decoration-ink"
        >
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}
