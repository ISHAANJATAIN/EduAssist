import type { QuizOut } from '@/api/quizzes'
import { FlashcardDeck } from '@/components/quiz/FlashcardDeck'
import { QuizCard } from '@/components/quiz/QuizCard'
import { useTopics } from '@/hooks/useTopics'

export function QuizMessage({ quiz }: { quiz: QuizOut }) {
  const { data: topics } = useTopics()

  const topicNames = quiz.topic_ids
    .map((topicId) => topics?.find((topic) => topic.id === topicId)?.name)
    .filter((name): name is string => Boolean(name))

  const count = quiz.items.length
  const label =
    quiz.kind === 'quiz'
      ? `${count} question${count === 1 ? '' : 's'}`
      : `${count} card${count === 1 ? '' : 's'}`
  const kind = quiz.kind === 'quiz' ? 'Quiz' : 'Flashcards'
  const difficulty =
    quiz.difficulty.charAt(0).toUpperCase() + quiz.difficulty.slice(1)

  return (
    <div className="flex justify-start">
      <article className="w-full max-w-chat rounded-lg rounded-bl-sm border border-neutral-200/70 bg-neutral-50/95 px-4 py-4 text-sm text-neutral-700 shadow-card backdrop-blur-glass">
        <header className="mb-4 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">
            {kind} · {difficulty} · {label}
          </h3>
          {topicNames.map((name) => (
            <span
              key={name}
              className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
            >
              {name}
            </span>
          ))}
        </header>
        {quiz.warning && (
          <p className="mb-4 rounded-md border border-warning/20 bg-warning-bg px-3 py-2 text-xs text-warning-text">
            {quiz.warning}
          </p>
        )}
        {quiz.kind === 'quiz' ? (
          <QuizCard quiz={quiz} />
        ) : (
          <FlashcardDeck quiz={quiz} />
        )}
      </article>
    </div>
  )
}
