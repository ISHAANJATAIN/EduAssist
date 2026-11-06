import { useState } from 'react'

import { isQuestion, type AttemptOut, type QuizOut } from '@/api/quizzes'
import { QuestionItem } from '@/components/quiz/QuestionItem'
import { QuizResult } from '@/components/quiz/QuizResult'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useSubmitAttempt } from '@/hooks/useQuiz'

interface QuizCardProps {
  quiz: QuizOut
  onSubmitted?: (attempt: AttemptOut) => void
}

export function QuizCard({ quiz, onSubmitted }: QuizCardProps) {
  const questions = quiz.items.filter(isQuestion)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [attempt, setAttempt] = useState<AttemptOut | null>(null)
  const mutation = useSubmitAttempt()

  if (attempt) {
    return <QuizResult quiz={quiz} attempt={attempt} />
  }

  if (questions.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        This quiz has no questions yet.
      </p>
    )
  }

  const current = questions[index]
  const answered = questions.filter(
    (question) => answers[question.id] !== undefined,
  ).length
  const complete = answered === questions.length
  const isLast = index === questions.length - 1

  const submit = () => {
    if (!complete || mutation.isPending) return
    mutation.mutate(
      {
        quizId: quiz.id,
        payload: {
          answers: questions.map((question) => ({
            item_id: question.id,
            selected_index: answers[question.id],
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
            Question {index + 1} of {questions.length}
          </span>
          <span>{answered} answered</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${((index + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <QuestionItem
        item={current}
        selected={answers[current.id]}
        onSelect={(optionIndex) =>
          setAnswers((previous) => ({ ...previous, [current.id]: optionIndex }))
        }
      />

      {mutation.error ? (
        <ErrorBanner error={mutation.error} onRetry={submit} />
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          disabled={index === 0 || mutation.isPending}
        >
          Back
        </Button>
        {isLast ? (
          <Button
            type="button"
            onClick={submit}
            disabled={!complete}
            loading={mutation.isPending}
          >
            Submit answers
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() =>
              setIndex((value) => Math.min(questions.length - 1, value + 1))
            }
            disabled={mutation.isPending}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  )
}
