import type { PlanDay, PlanSlot } from '@/api/planner'
import { formatDate, formatMinutes, todayIso } from '@/lib/format'

const TYPE_STYLES: Record<PlanSlot['type'], string> = {
  study: 'bg-brand-50 text-brand-700',
  revision: 'bg-warning-bg text-warning-text',
}

const TYPE_LABELS: Record<PlanSlot['type'], string> = {
  study: 'Study',
  revision: 'Revision',
}

export function DayCard({ day }: { day: PlanDay }) {
  const isToday = day.date === todayIso()

  return (
    <article className="glass-raised h-full p-4" aria-label={formatDate(day.date)}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-900">
          {formatDate(day.date)}
          {isToday ? (
            <span className="ml-2 text-xs font-medium text-brand-600">Today</span>
          ) : null}
        </h3>
        <span className="text-xs font-medium text-neutral-500">
          {day.total_minutes > 0 ? formatMinutes(day.total_minutes) : 'Free'}
        </span>
      </header>

      {day.slots.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">No sessions scheduled.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {day.slots.map((slot, index) => (
            <li
              key={`${slot.type}-${slot.topic_id}-${index}`}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_STYLES[slot.type]}`}
              >
                {TYPE_LABELS[slot.type]}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-neutral-700"
                title={slot.topic_name}
              >
                {slot.topic_name}
              </span>
              <span className="text-xs font-medium text-neutral-500">
                {formatMinutes(slot.minutes)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
