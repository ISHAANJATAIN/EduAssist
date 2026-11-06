import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useAuth } from '@/hooks/useAuth'

export function RegisterPage() {
  const { register } = useAuth()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    register.mutate({
      name: String(data.get('name')),
      email: String(data.get('email')),
      password: String(data.get('password')),
    })
  }

  return (
    <AuthLayout>
      <h2 className="text-2xl font-semibold text-neutral-900">Create account</h2>
      <p className="mt-1 text-base text-neutral-600">
        Start with one course. Add material next.
      </p>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="field-label" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            required
            className="field-input"
            placeholder="Ishan Jatain"
          />
        </div>

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
            autoComplete="new-password"
            minLength={8}
            required
            className="field-input"
            placeholder="••••••••"
          />
          <p className="field-hint">At least 8 characters.</p>
        </div>

        {register.error ? <ErrorBanner error={register.error} /> : null}

        <Button type="submit" className="w-full" loading={register.isPending}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-600">
        Already have an account?{' '}
        <Link
          to="/login"
          className="font-semibold text-brand-600 hover:text-brand-700"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
