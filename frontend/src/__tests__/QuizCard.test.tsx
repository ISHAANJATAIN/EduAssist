import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { QuizOut } from '@/api/quizzes'
import { QuizCard } from '@/components/quiz/QuizCard'

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock('@/hooks/useQuiz', () => ({
  useSubmitAttempt: () => ({ mutate, isPending: false, error: null }),
}))

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

describe('QuizCard', () => {
  beforeEach(() => {
    mutate.mockReset()
  })

  it('selects an answer and shows the source', async () => {
    const user = userEvent.setup()
    render(<QuizCard quiz={QUIZ} />)

    expect(
      screen.getByText('Which condition is required for deadlock?'),
    ).toBeInTheDocument()
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('os.pptx · p.5')).toBeInTheDocument()

    const option = screen.getByLabelText('Mutual exclusion')
    expect(option).not.toBeChecked()
    await user.click(option)
    expect(option).toBeChecked()
  })

  it('moves between questions with Next and Back', async () => {
    const user = userEvent.setup()
    render(<QuizCard quiz={QUIZ} />)

    await user.click(screen.getByLabelText('Mutual exclusion'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(
      screen.getByText('What does the banker algorithm prevent?'),
    ).toBeInTheDocument()
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Mutual exclusion')).toBeChecked()
  })

  it('disables submit until every question is answered', async () => {
    const user = userEvent.setup()
    render(<QuizCard quiz={QUIZ} />)

    await user.click(screen.getByLabelText('Mutual exclusion'))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(
      screen.getByRole('button', { name: 'Submit answers' }),
    ).toBeDisabled()

    await user.click(screen.getByLabelText('Deadlock'))
    expect(
      screen.getByRole('button', { name: 'Submit answers' }),
    ).toBeEnabled()
  })

  it('submits one answer per item with the selected index', async () => {
    const user = userEvent.setup()
    render(<QuizCard quiz={QUIZ} />)

    await user.click(screen.getByLabelText('Mutual exclusion'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByLabelText('Deadlock'))
    await user.click(screen.getByRole('button', { name: 'Submit answers' }))

    expect(mutate).toHaveBeenCalledWith(
      {
        quizId: 'quiz-1',
        payload: {
          answers: [
            { item_id: 'item-1', selected_index: 1 },
            { item_id: 'item-2', selected_index: 0 },
          ],
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })
})
