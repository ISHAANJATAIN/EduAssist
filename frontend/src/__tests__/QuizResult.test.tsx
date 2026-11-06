import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { AttemptOut, QuizOut } from '@/api/quizzes'
import { QuizResult } from '@/components/quiz/QuizResult'

const TOPIC_ID = '9d3b3d5e-1f5b-4f0e-9b6b-6f1a2c3d4e5f'

const QUIZ: QuizOut = {
  id: 'quiz-1',
  kind: 'quiz',
  difficulty: 'medium',
  topic_ids: [TOPIC_ID],
  items: [
    {
      id: 'item-1',
      topic_id: TOPIC_ID,
      question: 'Which condition is required for deadlock?',
      options: ['Preemption', 'Mutual exclusion', 'Starvation', 'Thrashing'],
      source: { filename: 'os.pptx', page: 5 },
    },
    {
      id: 'item-2',
      topic_id: TOPIC_ID,
      question: 'What does the banker algorithm prevent?',
      options: ['Deadlock', 'Paging', 'Caching', 'Fragmentation'],
      source: { filename: 'os.pptx', page: 7 },
    },
  ],
}

const ATTEMPT: AttemptOut = {
  attempt_id: 'attempt-1',
  score_percent: 50,
  correct_count: 1,
  total: 2,
  results: [
    { item_id: 'item-1', correct: true, topic_id: TOPIC_ID },
    {
      item_id: 'item-2',
      correct: false,
      correct_index: 0,
      topic_id: TOPIC_ID,
    },
  ],
  mastery_updates: [{ topic_id: TOPIC_ID, old: 50, new: 80 }],
  recommendations: [
    {
      topic_id: TOPIC_ID,
      topic_name: 'Deadlock',
      action: 'revise',
      reason: 'Last score was 0% after 2 attempts.',
      rule_id: 'R1',
    },
  ],
}

describe('QuizResult', () => {
  it('shows the mastery change in percent after an attempt', () => {
    render(<QuizResult quiz={QUIZ} attempt={ATTEMPT} />)

    expect(screen.getByText('1 of 2 correct')).toBeInTheDocument()
    expect(screen.getByText('Topic mastery')).toBeInTheDocument()
    expect(screen.getByText('Mastery 50% → 80%')).toBeInTheDocument()
  })

  it('prefixes each next step with its topic', () => {
    render(<QuizResult quiz={QUIZ} attempt={ATTEMPT} />)

    expect(screen.getByText('Next steps')).toBeInTheDocument()
    expect(screen.getByText('Deadlock')).toBeInTheDocument()
    expect(
      screen.getByText(/Last score was 0% after 2 attempts\./),
    ).toBeInTheDocument()
  })
})
