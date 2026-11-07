import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PlanForm } from '@/components/planner/PlanForm'

describe('PlanForm', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 2, 8, 12))
  })

  afterEach(() => vi.useRealTimers())

  it.each([
    ['2026-03-07', /past/i],
    ['2027-03-09', /365/i],
  ])('rejects an exam outside the planner horizon: %s', (examDate, error) => {
    const onSubmit = vi.fn()
    render(<PlanForm defaultExamDate={examDate} defaultFreeHours={2} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: 'Build plan' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(error)
  })

  it('rejects blank daily hours instead of silently submitting zero', () => {
    const onSubmit = vi.fn()
    render(<PlanForm defaultExamDate="2026-03-09" defaultFreeHours={2} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Free hours per day'), { target: { value: '' } })

    fireEvent.click(screen.getByRole('button', { name: 'Build plan' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/hours/i)
  })

  it.each(['2026-03-08', '2027-03-08'])('accepts the inclusive horizon boundary %s and explicit zero hours', (examDate) => {
    const onSubmit = vi.fn()
    render(<PlanForm defaultExamDate={examDate} defaultFreeHours={0} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: 'Build plan' }))

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      exam_date: examDate,
      free_hours_per_day: 0,
      overrides: null,
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ignores form submission while pending and allows it after completion', () => {
    const onSubmit = vi.fn()
    const props = { defaultExamDate: '2026-03-09', defaultFreeHours: 2, onSubmit }
    const { rerender } = render(<PlanForm {...props} pending />)
    const submit = screen.getByRole('button', { name: /Build plan/ })
    const form = submit.closest('form')!

    expect(submit).toBeDisabled()
    fireEvent.submit(form)
    expect(onSubmit).not.toHaveBeenCalled()

    rerender(<PlanForm {...props} pending={false} />)
    fireEvent.submit(form)
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      exam_date: '2026-03-09',
      free_hours_per_day: 2,
      overrides: null,
    })
  })
})
