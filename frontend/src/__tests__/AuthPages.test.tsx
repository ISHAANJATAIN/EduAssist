import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'

function renderPage(path: '/login' | '/register') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div>landing</div>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe.each([
  ['/login', 'Sign in'],
  ['/register', 'Create account'],
] as const)('%s page', (path, heading) => {
  it('offers a way back to the landing page', () => {
    renderPage(path)

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: /back to home/i })[0],
    ).toHaveAttribute('href', '/')
  })
})
