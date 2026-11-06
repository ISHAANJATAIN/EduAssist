import type { MasteryStatus, TopicPerformance } from '@/api/performance'
import { formatPercent } from '@/lib/format'

const STATUS_STYLES: Record<MasteryStatus, string> = {
  untested: 'bg-neutral-100 text-neutral-600',
  weak: 'bg-danger-bg text-danger-text',
  developing: 'bg-warning-bg text-warning-text',
  strong: 'bg-success-bg text-success-text',
}

const STATUS_LABELS: Record<MasteryStatus, string> = {
  untested: 'Untested',
  weak: 'Weak',
  developing: 'Developing',
  strong: 'Strong',
}

export function TopicTable({ topics }: { topics: TopicPerformance[] }) {
  if (topics.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-neutral-500">
        No topics yet. Add them in the Library and take a quiz.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm lg:min-w-0">
        <thead>
          <tr className="border-b border-neutral-200 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <th scope="col" className="py-2 pr-4">
              Topic
            </th>
            <th scope="col" className="py-2 pr-4">
              Mastery
            </th>
            <th scope="col" className="py-2 pr-4">
              Attempts
            </th>
            <th scope="col" className="py-2 pr-4">
              Last score
            </th>
            <th scope="col" className="py-2">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {topics.map((topic) => (
            <tr key={topic.topic_id}>
              <td className="py-3 pr-4 font-medium text-neutral-900">
                {topic.topic_name}
              </td>
              <td className="py-3 pr-4 text-neutral-700">
                {topic.attempts === 0 ? '—' : formatPercent(topic.mastery)}
              </td>
              <td className="py-3 pr-4 text-neutral-700">{topic.attempts}</td>
              <td className="py-3 pr-4 text-neutral-700">
                {topic.last_score === null ? '—' : formatPercent(topic.last_score)}
              </td>
              <td className="py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[topic.status]}`}
                >
                  {STATUS_LABELS[topic.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
