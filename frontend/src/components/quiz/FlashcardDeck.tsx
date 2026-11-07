import { useState } from 'react'

import type { AttemptOut, Flashcard, QuizOut } from '@/api/quizzes'
import { QuizResult } from '@/components/quiz/QuizResult'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useSubmitAttempt } from '@/hooks/useQuiz'

interface FlashcardDeckProps {
  quiz: QuizOut
  onSubmitted?: (attempt: AttemptOut) => void
}

export function FlashcardDeck({ quiz, onSubmitted }: FlashcardDeckProps) {
  const cards = quiz.items.filter(
    (item): item is Flashcard => 'front' in item,
  )
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [ratings, setRatings] = useState<Record<string, boolean>>({})
  const [attempt, setAttempt] = useState<AttemptOut | null>(null)
  const mutation = useSubmitAttempt()

  if (attempt) {
    return <QuizResult quiz={quiz} attempt={attempt} />
  }

  if (cards.length === 0) {
    return <p className="text-sm text-neutral-500">This deck has no cards yet.</p>
  }

  const current = cards[index]
  const ratedCount = cards.filter(
    (card) => ratings[card.id] !== undefined,
  ).length
  const complete = ratedCount === cards.length

  const rate = (known: boolean) => {
    setRatings((previous) => ({ ...previous, [current.id]: known }))
    setFlipped(false)
    setIndex((value) => Math.min(cards.length - 1, value + 1))
  }

  const finish = () => {
    if (!complete || mutation.isPending) return
    mutation.mutate(
      {
        quizId: quiz.id,
        payload: {
          ratings: cards.map((card) => ({
            item_id: card.id,
            known: ratings[card.id],
          })),
        },
      },
      {
        onSuccess: (result) => {
          setAttempt(result)
          onSubmitted?.(result)
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-xs font-medium text-neutral-500">
          <span>
            Card {index + 1} of {cards.length}
          </span>
          <span>{ratedCount} rated</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${(ratedCount / cards.length) * 100}%` }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        aria-label={flipped ? 'Show card front' : 'Show card back'}
        className="min-h-44 w-full rounded-lg border border-ink/10 bg-gradient-to-br from-paper-deep to-paper-card px-4 py-6 text-center transition duration-200 hover:-translate-y-0.5 hover:border-ink/30 hover:shadow-lift"
      >
        <span className="font-label text-[11px] uppercase tracking-[0.22em] text-gold">
          {flipped ? 'Back' : 'Front'}
        </span>
        <span className="mt-2 block whitespace-pre-wrap break-words text-base text-neutral-900">
          {flipped ? current.back : current.front}
        </span>
        <span className="mt-4 block text-xs text-neutral-500">
          {flipped ? 'Tap to see the front' : 'Tap or press Space to flip'}
        </span>
      </button>
      <p className="text-xs text-neutral-500">
        {current.source.filename}
        {current.source.page ? ` · p.${current.source.page}` : ''}
      </p>

      {mutation.error ? (
        <ErrorBanner error={mutation.error} onRetry={finish} />
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => rate(false)}
          disabled={mutation.isPending}
        >
          Not known
        </Button>
        <Button
          type="button"
          onClick={() => rate(true)}
          disabled={mutation.isPending}
        >
          Known
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          disabled={index === 0 || mutation.isPending}
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={finish}
          disabled={!complete}
          loading={mutation.isPending}
        >
          Finish
        </Button>
      </div>
    </div>
  )
}
