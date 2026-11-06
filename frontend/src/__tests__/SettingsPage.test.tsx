import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsPage } from '@/pages/SettingsPage'

const { deleteMyData, updateMutate, course } = vi.hoisted(() => ({
  deleteMyData: vi.fn(),
  updateMutate: vi.fn(),
  course: {
    id: 'course-1',
    name: 'Operating Systems',
    exam_date: '2026-12-01',
    free_hours_per_day: 2,
  },
}))

vi.mock('@/api/account', () => ({ deleteMyData }))

vi.mock('@/hooks/useCourse', () => ({
  useCourse: () => ({
    data: course,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateCourse: () => ({
    mutate: updateMutate,
    isPending: false,
    error: null,
  }),
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/chat" element={<div>chat-home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    deleteMyData.mockReset()
    deleteMyData.mockResolvedValue(undefined)
    updateMutate.mockReset()
  })

  it('saves course defaults as numbers and nullable dates', async () => {
    const user = userEvent.setup()
    renderPage()

    const name = screen.getByLabelText('Course name')
    await user.clear(name)
    await user.type(name, 'Databases')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(updateMutate).toHaveBeenCalledWith(
      {
        name: 'Databases',
        exam_date: '2026-12-01',
        free_hours_per_day: 2,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('deletes all data only after typing DELETE', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Delete my data' }))

    const confirm = screen.getByRole('button', { name: 'Delete everything' })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText(/Type DELETE to confirm/), 'DELETE')
    expect(confirm).toBeEnabled()

    await user.click(confirm)

    await waitFor(() => expect(deleteMyData).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('chat-home')).toBeInTheDocument()
  })
})
