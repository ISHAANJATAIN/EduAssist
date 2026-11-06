import type { Citation } from '@/api/chat'

export function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null

  return (
    <div className="mt-3 border-t border-neutral-200/80 pt-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Sources
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {citations.map((citation) => (
          <li key={`${citation.document_id}-${citation.page ?? 'all'}`}>
            <span
              tabIndex={0}
              title={citation.snippet}
              className="inline-flex max-w-full items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700"
            >
              <span className="truncate">
                {citation.filename} · p.{citation.page ?? '—'}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
