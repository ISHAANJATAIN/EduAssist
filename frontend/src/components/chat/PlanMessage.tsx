import { Link } from 'react-router-dom'

import type { PlanReply } from '@/api/chat'
import { daysUntil, formatDate, formatMinutes } from '@/lib/format'

export function PlanMessage({ reply }: { reply: PlanReply }) {
  const plan = reply.plan
  const notes = plan.notes ?? []
  const preview = plan.days.slice(0, 3)
  const examIn = Math.max(daysUntil(plan.exam_date), 0)

  return (
    <div className="flex justify-start">
      <article className="w-full max-w-chat rounded-lg rounded-bl-sm border border-neutral-200/70 bg-neutral-50/95 px-4 py-4 text-sm text-neutral-700 shadow-card backdrop-blur-glass">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">
            Study plan · exam in {examIn} {examIn === 1 ? 'day' : 'days'}
          </h3>
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

        {preview.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            There are no study days left before the exam.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {preview.map((day) => (
              <li
                key={day.date}
                className="rounded-md border border-neutral-200/80 bg-white/60 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold text-neutral-900">
                    {formatDate(day.date)}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {day.total_minutes > 0
                      ? formatMinutes(day.total_minutes)
                      : 'Free'}
                  </p>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {day.slots.length === 0 ? (
                    <span className="text-xs text-neutral-500">
                      No sessions
                    </span>
                  ) : (
                    day.slots.map((slot, index) => (
                      <span
                        key={`${slot.type}-${slot.topic_id}-${index}`}
                        title={`${
                          slot.type === 'study' ? 'Study' : 'Revision'
                        }: ${slot.topic_name}`}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          slot.type === 'study'
                            ? 'bg-brand-50 text-brand-700'
                            : 'bg-warning-bg text-warning-text'
                        }`}
                      >
                        {slot.topic_name}
                      </span>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {plan.days.length > preview.length ? (
          <p className="mt-2 text-xs text-neutral-500">
            {plan.days.length - preview.length} more{' '}
            {plan.days.length - preview.length === 1 ? 'day' : 'days'} in the
            planner.
          </p>
        ) : null}

        {plan.feasible || notes.length === 0 ? null : (
          <p className="mt-3 text-xs text-warning-text">{notes[0]}</p>
        )}

        <div className="mt-4">
          <Link
            to="/planner"
            className="inline-flex h-9 items-center rounded-md border border-neutral-200 bg-white/72 px-3 text-sm font-semibold text-neutral-700 transition hover:bg-white/90"
          >
            Open planner
          </Link>
        </div>
      </article>
    </div>
  )
}
