import { Link } from 'react-router-dom'

import type { ClarifyReply } from '@/api/chat'
import { InfoIcon } from '@/components/ui/Icon'

const MISSING_LABELS: Record<string, string> = {
  exam_date: 'Exam date',
}

export function ClarifyMessage({ reply }: { reply: ClarifyReply }) {
  return (
    <div className="flex justify-start">
      <article className="w-full max-w-chat rounded-lg rounded-bl-sm border border-neutral-200/70 bg-neutral-50/95 px-4 py-3 text-base text-neutral-700 shadow-card backdrop-blur-glass">
        <div className="flex items-start gap-2 rounded-md bg-info-bg px-3 py-2 text-sm text-info-text">
          <InfoIcon size={16} className="mt-0.5 shrink-0" />
          <p className="whitespace-pre-wrap break-words">{reply.text}</p>
        </div>

        {reply.missing.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Still needed
            </span>
            {reply.missing.map((name) => (
              <span
                key={name}
                className="rounded-full bg-info-bg px-2.5 py-0.5 text-xs font-semibold text-info-text"
              >
                {MISSING_LABELS[name] ?? name.replaceAll('_', ' ')}
              </span>
            ))}
          </div>
        ) : null}

        {reply.missing.includes('exam_date') ? (
          <div className="mt-3">
            <Link
              to="/planner"
              className="inline-flex h-9 items-center rounded-md border border-neutral-200 bg-white/72 px-3 text-sm font-semibold text-neutral-700 transition hover:bg-white/90"
            >
              Open planner
            </Link>
          </div>
        ) : null}
      </article>
    </div>
  )
}
