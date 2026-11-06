import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PlanOut } from '@/api/planner'
import { PlanCalendar } from '@/components/planner/PlanCalendar'
import { formatDate } from '@/lib/format'

const PLAN: PlanOut = {
  id: '7f9a6d2b-1c3e-4a5b-8d6f-2e1c0b9a8d7e',
  exam_date: '2026-12-20',
  feasible: true,
  days: [
    {
      date: '2026-12-01',
      total_minutes: 90,
      slots: [
        {
          topic_id: '11111111-1111-4111-8111-111111111111',
          topic_name: 'Processes',
          minutes: 60,
          type: 'study',
        },
        {
          topic_id: '11111111-1111-4111-8111-111111111111',
          topic_name: 'Processes',
          minutes: 30,
          type: 'revision',
        },
      ],
    },
    { date: '2026-12-02', total_minutes: 0, slots: [] },
  ],
  notes: [],
}

describe('PlanCalendar', () => {
  it('renders each day with its slots and totals', () => {
    render(<PlanCalendar plan={PLAN} />)

    expect(screen.getByText('Study calendar')).toBeInTheDocument()
    expect(
      screen.getByText(
        `Exam on ${formatDate('2026-12-20')} · 1 h 30 min scheduled`,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(formatDate('2026-12-01'))).toBeInTheDocument()
    expect(screen.getAllByText('Processes')).toHaveLength(2)
    expect(screen.getByText('Study')).toBeInTheDocument()
    expect(screen.getByText('Revision')).toBeInTheDocument()
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByText('No sessions scheduled.')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('explains what was relaxed when the plan is adjusted', () => {
    render(
      <PlanCalendar
        plan={{
          ...PLAN,
          feasible: false,
          notes: ['Dropped revision sessions for strong topics.'],
        }}
      />,
    )

    expect(screen.getByText('Adjusted')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This plan was adjusted to fit your available time.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Dropped revision sessions for strong topics.'),
    ).toBeInTheDocument()
  })
})
