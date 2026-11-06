import { isQuestion, type AttemptOut, type QuizOut } from '@/api/quizzes'
import { CheckIcon, CloseIcon } from '@/components/ui/Icon'

interface QuizResultProps {
  quiz: QuizOut
  attempt: AttemptOut
}

function scoreMessage(score: number): string {
  if (score >= 75) return 'Strong result. Keep this topic fresh.'
  if (score >= 40) return 'Progress — review the misses and try again.'
  return 'Revise this material, then take another quiz.'
}

export function QuizResult({ quiz, attempt }: QuizResultProps) {
  const items = new Map(quiz.items.map((item) => [item.id, item]))
  const score = Math.round(attempt.score_percent)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div
          role="img"
          aria-label={`Score ${score} percent`}
          className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(#4F46E5 ${score}%, #E2E8F0 0)`,
          }}
        >
          <div className="grid h-16 w-16 place-items-center rounded-full bg-white">
            <span className="text-lg font-semibold text-neutral-900">
              {score}%
            </span>
          </div>
        </div>
        <div>
          <p className="text-base font-semibold text-neutral-900">
            {attempt.correct_count} of {attempt.total} correct
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {scoreMessage(attempt.score_percent)}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {attempt.results.map((result) => {
          const item = items.get(result.item_id)
          const label = item
            ? isQuestion(item)
              ? item.question
              : item.front
            : 'Item'

          return (
            <li
              key={result.item_id}
              className={`rounded-md border px-3 py-2.5 ${
                result.correct
                  ? 'border-success/20 bg-success-bg/60'
                  : 'border-danger/20 bg-danger-bg/60'
              }`}
            >
              <div className="flex items-start gap-2">
                {result.correct ? (
                  <CheckIcon
                    size={16}
                    className="mt-0.5 shrink-0 text-success-text"
                  />
                ) : (
                  <CloseIcon
                    size={16}
                    className="mt-0.5 shrink-0 text-danger-text"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900">{label}</p>
                  {!result.correct &&
                  item &&
                  isQuestion(item) &&
                  typeof result.correct_index === 'number' ? (
                    <p className="mt-1 text-sm text-neutral-700">
                      Correct answer: {item.options[result.correct_index]}
                    </p>
                  ) : null}
                  {result.explanation ? (
                    <p className="mt-1 break-words text-sm text-neutral-500">
                      {result.explanation}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {(attempt.mastery_updates?.length ?? 0) > 0 ? (
        <div>
          <h4 className="text-sm font-semibold text-neutral-900">
            Topic mastery
          </h4>
          <ul className="mt-2 space-y-1 text-sm text-neutral-700">
            {(attempt.mastery_updates ?? []).map((update) => (
              <li key={update.topic_id}>
                Mastery {Math.round(update.old)}% → {Math.round(update.new)}%
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(attempt.recommendations?.length ?? 0) > 0 ? (
        <div>
          <h4 className="text-sm font-semibold text-neutral-900">
            Next steps
          </h4>
          <ul className="mt-2 space-y-1 text-sm text-neutral-700">
            {(attempt.recommendations ?? []).map((recommendation) => (
              <li key={`${recommendation.topic_id}-${recommendation.rule_id}`}>
                <span className="font-medium text-neutral-900">
                  {recommendation.topic_name}
                </span>{' '}
                — {recommendation.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
