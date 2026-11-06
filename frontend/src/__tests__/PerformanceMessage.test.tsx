import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { PerformanceReply } from '@/api/chat'
import { PerformanceMessage } from '@/components/chat/PerformanceMessage'

function topic(
  index: number,
  status: 'weak' | 'strong',
  attempts = 2,
): PerformanceReply['summary']['topics'][number] {
  return {
    topic_id: `00000000-0000-4000-8000-00000000000${index}`,
    topic_name: `${status === 'weak' ? 'Weak' : 'Strong'} topic ${index}`,
    mastery: status === 'weak' ? 20 : 85,
    attempts,
    last_score: status === 'weak' ? 20 : 85,
    status,
  }
}

const reply: PerformanceReply = {
  type: 'performance',
  summary: {
    topics: [
      topic(1, 'weak'),
      topic(2, 'weak'),
      topic(3, 'weak'),
      topic(4, 'weak'),
      topic(5, 'strong'),
      topic(6, 'strong'),
      topic(7, 'strong'),
      topic(8, 'strong'),
    ],
    weak_topic_ids: [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
    ],
    strong_topic_ids: [
      '00000000-0000-4000-8000-000000000005',
      '00000000-0000-4000-8000-000000000006',
      '00000000-0000-4000-8000-000000000007',
      '00000000-0000-4000-8000-000000000008',
    ],
  },
  recommendations: [1, 2, 3, 4].map((index) => ({
    topic_id: `00000000-0000-4000-8000-00000000000${index}`,
    topic_name: `Recommendation topic ${index}`,
    action: 'take_quiz',
    reason: `Reason number ${index}`,
    rule_id: 'R2',
  })),
}

describe('PerformanceMessage', () => {
  it('caps weak, strong and recommendation lists at three', () => {
    render(
      <MemoryRouter>
        <PerformanceMessage reply={reply} />
      </MemoryRouter>,
    )

    expect(screen.getByText('Your progress')).toBeInTheDocument()
    expect(screen.getByText('Weak topic 3')).toBeInTheDocument()
    expect(screen.queryByText('Weak topic 4')).not.toBeInTheDocument()
    expect(screen.getByText('Strong topic 7')).toBeInTheDocument()
    expect(screen.queryByText('Strong topic 8')).not.toBeInTheDocument()
    expect(screen.getByText('Reason number 3')).toBeInTheDocument()
    expect(screen.queryByText('Reason number 4')).not.toBeInTheDocument()
  })

  it('links to the dashboard', () => {
    render(
      <MemoryRouter>
        <PerformanceMessage reply={reply} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Open dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    )
  })

  it('prompts for topics when the course is empty', () => {
    render(
      <MemoryRouter>
        <PerformanceMessage
          reply={{
            type: 'performance',
            summary: { topics: [], weak_topic_ids: [], strong_topic_ids: [] },
            recommendations: [],
          }}
        />
      </MemoryRouter>,
    )

    expect(
      screen.getByText(
        'Add topics in the Library and take a quiz to start tracking mastery.',
      ),
    ).toBeInTheDocument()
  })
})
