import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { QuizOut } from '@/api/quizzes'
import { FlashcardDeck } from '@/components/quiz/FlashcardDeck'

const QUIZ: QuizOut = {
  id: 'quiz-1',
  kind: 'flashcards',
  difficulty: 'medium',
  topic_ids: ['topic-1'],
  items: [
    {
      id: 'card-1',
      topic_id: 'topic-1',
      front: 'What is mutual exclusion?',
      back: 'Only one process can access a resource at a time.',
      source: { filename: 'os.pptx', page: 5 },
    },
    {
      id: 'card-2',
      topic_id: 'topic-1',
      front: 'What is a page fault?',
      back: 'A requested page is not in memory.',
      source: { filename: 'os.pptx', page: 7 },
    },
  ],
}

function renderDeck() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <FlashcardDeck quiz={QUIZ} />
    </QueryClientProvider>,
  )
}

describe('FlashcardDeck', () => {
  it('exposes the current question as an accessible description without revealing the answer', async () => {
    const user = userEvent.setup()
    renderDeck()
    const card = screen.getByRole('button', { name: 'Show card back' })

    expect(card).toHaveAccessibleDescription('What is mutual exclusion?')
    expect(screen.queryByText('Only one process can access a resource at a time.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Known' }))
    expect(card).toHaveAccessibleDescription('What is a page fault?')
    expect(screen.queryByText('A requested page is not in memory.')).not.toBeInTheDocument()
  })

  it('exposes only the answer after a keyboard flip and only the question when flipped back', async () => {
    const user = userEvent.setup()
    renderDeck()
    const card = screen.getByRole('button', { name: 'Show card back' })
    card.focus()
    await user.keyboard(' ')

    expect(card).toHaveAccessibleName('Show card front')
    expect(card).toHaveAccessibleDescription('Only one process can access a resource at a time.')
    expect(screen.queryByText('What is mutual exclusion?')).not.toBeInTheDocument()

    await user.keyboard(' ')
    expect(card).toHaveAccessibleName('Show card back')
    expect(card).toHaveAccessibleDescription('What is mutual exclusion?')
    expect(screen.queryByText('Only one process can access a resource at a time.')).not.toBeInTheDocument()
  })
})
