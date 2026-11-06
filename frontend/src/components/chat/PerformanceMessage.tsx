import { Link } from 'react-router-dom'

import type { PerformanceReply } from '@/api/chat'
import { formatPercent } from '@/lib/format'

const ACTION_LABELS: Record<PerformanceReply['recommendations'][number]['action'], string> = {
  revise: 'Revise',
  prerequisite_first: 'Start with prerequisite',
  take_quiz: 'Take a quiz',
  maintain: 'Maintain',
}

function TopicList({
  title,
  tone,
  topics,
}: {
  title: string
  tone: 'danger' | 'success'
  topics: PerformanceReply['summary']['topics']
}) {
  const heading =
    tone === 'danger' ? 'text-danger-text' : 'text-success-text'
  const item =
    tone === 'danger' ? 'text-danger-text' : 'text-success-text'

  return (
    <section>
      <h4 className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>
        {title}
      </h4>
      {topics.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">None right now.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {topics.map((topic) => (
            <li key={topic.topic_id} className="flex items-baseline gap-2 text-sm">
              <span className={`font-semibold ${item}`}>
                {formatPercent(topic.mastery)}
              </span>
              <span className="text-neutral-700">{topic.topic_name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function PerformanceMessage({ reply }: { reply: PerformanceReply }) {
  const { summary, recommendations } = reply
  const weak = summary.topics.filter((topic) => topic.status === 'weak').slice(0, 3)
  const strong = summary.topics
    .filter((topic) => topic.status === 'strong')
    .slice(0, 3)
  const tested = summary.topics.filter((topic) => topic.attempts > 0)
  const average =
    tested.length === 0
      ? null
      : Math.round(
          tested.reduce((sum, topic) => sum + topic.mastery, 0) / tested.length,
        )

  return (
    <div className="flex justify-start">
      <article className="w-full max-w-chat rounded-lg rounded-bl-sm border border-neutral-200/70 bg-neutral-50/95 px-4 py-4 text-sm text-neutral-700 shadow-card backdrop-blur-glass">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">
            Your progress
          </h3>
          <p className="text-xs text-neutral-500">
            {tested.length} of {summary.topics.length} topics tested
            {average === null ? '' : ` · ${average}% average`}
          </p>
        </header>

        {summary.topics.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            Add topics in the Library and take a quiz to start tracking mastery.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TopicList title="Weak" tone="danger" topics={weak} />
            <TopicList title="Strong" tone="success" topics={strong} />
          </div>
        )}

        {recommendations.length > 0 ? (
          <section className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Next steps
            </h4>
            <ul className="mt-2 space-y-2">
              {recommendations.slice(0, 3).map((item) => (
                <li
                  key={`${item.topic_id}-${item.rule_id}`}
                  className="rounded-md border border-neutral-200/80 bg-white/60 px-3 py-2"
                >
                  <p className="text-sm font-semibold text-neutral-900">
                    {ACTION_LABELS[item.action]} · {item.topic_name}
                  </p>
                  <p className="mt-0.5 text-sm text-neutral-600">{item.reason}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-4">
          <Link
            to="/dashboard"
            className="inline-flex h-9 items-center rounded-md border border-neutral-200 bg-white/72 px-3 text-sm font-semibold text-neutral-700 transition hover:bg-white/90"
          >
            Open dashboard
          </Link>
        </div>
      </article>
    </div>
  )
}
