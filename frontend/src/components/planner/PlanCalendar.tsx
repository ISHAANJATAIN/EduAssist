import type { PlanOut } from '@/api/planner'
import { DayCard } from '@/components/planner/DayCard'
import { formatDate, formatMinutes } from '@/lib/format'

export function PlanCalendar({ plan }: { plan: PlanOut }) {
  const notes = plan.notes ?? []
  const total = plan.days.reduce((sum, day) => sum + day.total_minutes, 0)

  return (
    <section aria-labelledby="plan-calendar-heading" className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3
            id="plan-calendar-heading"
            className="text-lg font-semibold text-neutral-900"
          >
            Study calendar
          </h3>
          <p className="mt-1 text-sm text-neutral-600">
            Exam on {formatDate(plan.exam_date)} · {formatMinutes(total)} scheduled
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            plan.feasible
              ? 'bg-success-bg text-success-text'
              : 'bg-warning-bg text-warning-text'
          }`}
        >
          {plan.feasible ? 'OK' : 'Adjusted'}
        </span>
      </header>

      {plan.feasible ? null : (
        <div
          role="status"
          className="rounded-md border border-warning/20 bg-warning-bg px-4 py-3 text-sm text-warning-text"
        >
          <p className="font-semibold">
            This plan was adjusted to fit your available time.
          </p>
          {notes.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {plan.days.length === 0 ? (
        <p className="rounded-md border border-neutral-200 bg-white/60 px-4 py-3 text-sm text-neutral-600">
          There are no study days left before the exam.
        </p>
      ) : (
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plan.days.map((day) => (
            <li key={day.date}>
              <DayCard day={day} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
