import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { normalizeError } from '@/api/client'
import type { DocumentOut } from '@/api/documents'
import { DocumentList } from '@/components/library/DocumentList'
import { TopicEditor } from '@/components/library/TopicEditor'
import { UploadDropzone } from '@/components/library/UploadDropzone'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Spinner } from '@/components/ui/Spinner'
import {
  useDeleteDocument,
  useDocuments,
  useUploadDocument,
} from '@/hooks/useDocuments'
import { topicsKey } from '@/hooks/useTopics'

export function LibraryPage() {
  const queryClient = useQueryClient()
  const documents = useDocuments()
  const upload = useUploadDocument()
  const removeDocument = useDeleteDocument()
  const [pendingDelete, setPendingDelete] = useState<DocumentOut | null>(null)

  const documentCount = documents.data?.length ?? 0
  const readyHandouts = (documents.data ?? [])
    .filter(
      (document) =>
        document.doc_type === 'handout' && document.status === 'ready',
    )
    .map((document) => document.id)
    .join(',')

  useEffect(() => {
    if (readyHandouts) {
      void queryClient.invalidateQueries({ queryKey: topicsKey })
    }
  }, [readyHandouts, queryClient])

  return (
    <div className="space-y-6">
      <section className="glass p-6">
        <h2 className="text-lg font-semibold text-neutral-900">Add material</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Upload lecture notes, slides or a syllabus handout. Text is extracted,
          chunked and indexed so answers can cite it.
        </p>
        <div className="mt-5">
          <UploadDropzone
            uploading={upload.isPending}
            error={upload.error ? normalizeError(upload.error).detail : null}
            onUpload={(file, docType) => upload.mutateAsync({ file, docType })}
          />
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <section className="glass p-6 lg:col-span-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-neutral-900">
              Documents
            </h2>
            {documentCount > 0 ? (
              <span className="text-sm text-neutral-500">
                {documentCount} file{documentCount === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>

          <div className="mt-4">
            {removeDocument.error ? (
              <div className="mb-4">
                <ErrorBanner error={removeDocument.error} />
              </div>
            ) : null}

            {documents.isLoading ? (
              <div className="flex justify-center py-8 text-neutral-500">
                <Spinner />
              </div>
            ) : documents.error ? (
              <ErrorBanner
                error={documents.error}
                onRetry={() => void documents.refetch()}
              />
            ) : (
              <DocumentList
                documents={documents.data ?? []}
                deletingId={
                  removeDocument.isPending
                    ? (removeDocument.variables ?? null)
                    : null
                }
                onDelete={setPendingDelete}
              />
            )}
          </div>
        </section>

        <section className="glass p-6 lg:col-span-2">
          <TopicEditor />
        </section>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete document?"
        description={
          pendingDelete
            ? `"${pendingDelete.filename}" and its indexed chunks will be removed. Questions already answered stay in chat.`
            : undefined
        }
        confirmLabel="Delete"
        loading={removeDocument.isPending}
        onConfirm={() => {
          if (!pendingDelete) return
          removeDocument.mutate(pendingDelete.id, {
            onSettled: () => setPendingDelete(null),
          })
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
