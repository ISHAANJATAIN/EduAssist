import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { PlanReply } from '@/api/chat'
import { PlanMessage } from '@/components/chat/PlanMessage'

const plan: PlanReply['plan'] = {
  id: '7f9a6d2b-1c3e-4a5b-8d6f-2e1c0b9a8d7e',
  exam_date: '2026-12-20',
  feasible: false,
  days: [
    {
      date: '2026-12-01',
      total_minutes: 60,
      slots: [
        {
          topic_id: '11111111-1111-4111-8111-111111111111',
          topic_name: 'Processes',
          minutes: 60,
          type: 'study',
        },
      ],
    },
    { date: '2026-12-02', total_minutes: 0, slots: [] },
    { date: '2026-12-03', total_minutes: 30, slots: [] },
    { date: '2026-12-04', total_minutes: 30, slots: [] },
  ],
  notes: ['Dropped revision sessions for strong topics.'],
}

function renderMessage(reply: PlanReply) {
  return render(
    <MemoryRouter>
      <PlanMessage reply={reply} />
    </MemoryRouter>,
  )
}

describe('PlanMessage', () => {
  it('previews the first three days and links to the planner', () => {
    renderMessage({ type: 'plan', plan })

    expect(screen.getByText(/Study plan · exam in/)).toBeInTheDocument()
    expect(screen.getByText('Adjusted')).toBeInTheDocument()
    expect(screen.getByText('Processes')).toBeInTheDocument()
    expect(screen.getByText('1 more day in the planner.')).toBeInTheDocument()
    expect(screen.getByText('Dropped revision sessions for strong topics.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open planner' })).toHaveAttribute(
      'href',
      '/planner',
    )
  })

  it('says when there are no days left before the exam', () => {
    renderMessage({
      type: 'plan',
      plan: { ...plan, feasible: true, days: [], notes: [] },
    })

    expect(
      screen.getByText('There are no study days left before the exam.'),
    ).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
  })
})
