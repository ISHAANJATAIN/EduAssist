import type { DocumentOut } from '@/api/documents'
import { AlertIcon, CheckIcon, TrashIcon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { formatDateTime } from '@/lib/format'

const statusStyles = {
  processing: 'bg-warning-bg text-warning-text',
  ready: 'bg-success-bg text-success-text',
  failed: 'bg-danger-bg text-danger-text',
} as const

const statusLabels = {
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
} as const

interface DocumentListProps {
  documents: DocumentOut[]
  deletingId: string | null
  onDelete: (document: DocumentOut) => void
}

export function DocumentList({
  documents,
  deletingId,
  onDelete,
}: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
        No material yet. Upload your first file above.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {documents.map((document) => (
        <li
          key={document.id}
          className="glass-raised flex items-start gap-3 p-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="max-w-full truncate text-sm font-semibold text-neutral-900">
                {document.filename}
              </p>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium capitalize text-neutral-600">
                {document.doc_type}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {document.status === 'ready'
                ? `${document.page_count} page${document.page_count === 1 ? '' : 's'} · ${document.chunk_count} chunk${document.chunk_count === 1 ? '' : 's'} · `
                : ''}
              Uploaded {formatDateTime(document.uploaded_at)}
            </p>
            {document.error ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-danger-text">
                <AlertIcon size={14} className="mt-0.5 shrink-0" />
                {document.error}
              </p>
            ) : null}
          </div>

          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[document.status]}`}
          >
            {document.status === 'processing' ? <Spinner size="sm" /> : null}
            {document.status === 'ready' ? <CheckIcon size={14} /> : null}
            {statusLabels[document.status]}
          </span>

          <button
            type="button"
            aria-label={`Delete ${document.filename}`}
            onClick={() => onDelete(document)}
            disabled={deletingId === document.id}
            className="rounded-md p-1.5 text-neutral-500 transition hover:bg-danger-bg hover:text-danger-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            <TrashIcon size={18} />
          </button>
        </li>
      ))}
    </ul>
  )
}
