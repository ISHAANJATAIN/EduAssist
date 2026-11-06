import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { LandingPage } from '@/pages/LandingPage'
import { useAuthStore } from '@/store/authStore'

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/chat" element={<div>chat-home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LandingPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null })
  })

  it('explains the product and points visitors at sign up', () => {
    renderLanding()

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /answers you can trust/i,
      }),
    ).toBeInTheDocument()

    const signUpLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === '/register')

    expect(signUpLinks.length).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('link', { name: /sign in/i })[0],
    ).toHaveAttribute('href', '/login')
  })

  it('sends signed-in visitors straight to the app', () => {
    useAuthStore.setState({
      token: 'token',
      user: {
        id: 'user-1',
        name: 'Ishaan',
        email: 'ishaan@example.com',
        created_at: '2026-01-01T00:00:00Z',
      },
    })

    renderLanding()

    expect(screen.getByText('chat-home')).toBeInTheDocument()
  })
})
