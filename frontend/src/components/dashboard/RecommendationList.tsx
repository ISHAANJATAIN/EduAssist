import type { Recommendation } from '@/api/performance'

const ACTION_META: Record<
  Recommendation['action'],
  { label: string; title: (topic: string) => string; icon: string; style: string }
> = {
  revise: {
    label: 'Revise',
    title: (topic) => `Revise ${topic}`,
    icon: '!',
    style: 'bg-danger-bg text-danger-text',
  },
  prerequisite_first: {
    label: 'Prerequisite',
    title: (topic) => `Start with the prerequisite for ${topic}`,
    icon: '↑',
    style: 'bg-warning-bg text-warning-text',
  },
  take_quiz: {
    label: 'Take a quiz',
    title: (topic) => `Test ${topic}`,
    icon: '?',
    style: 'bg-info-bg text-info-text',
  },
  maintain: {
    label: 'Maintain',
    title: (topic) => `Keep ${topic} fresh`,
    icon: '✓',
    style: 'bg-success-bg text-success-text',
  },
}

export function RecommendationList({ items }: { items: Recommendation[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
        No recommendations right now. Take a quiz to update your plan.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const meta = ACTION_META[item.action]
        return (
          <li
            key={`${item.topic_id}-${item.rule_id}`}
            className="rounded-md border border-neutral-200/80 bg-white/60 p-3"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${meta.style}`}
              >
                {meta.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-neutral-900">
                    {meta.title(item.topic_name)}
                  </p>
                  <span
                    title={`Rule ${item.rule_id}`}
                    className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-500"
                  >
                    {item.rule_id}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-600">{item.reason}</p>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
