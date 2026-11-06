import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react'

import { DOC_TYPES, type DocType } from '@/api/documents'
import { Button } from '@/components/ui/Button'
import { AlertIcon, UploadIcon } from '@/components/ui/Icon'

const ACCEPTED_EXTENSIONS = ['.pdf', '.pptx', '.docx', '.txt', '.md']
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

interface UploadDropzoneProps {
  onUpload: (file: File, docType: DocType) => Promise<unknown>
  uploading?: boolean
  error?: string | null
}

function validateFile(file: File): string | null {
  const suffix = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!ACCEPTED_EXTENSIONS.includes(suffix)) {
    return 'Upload a PDF, PPTX, DOCX, TXT or MD file.'
  }
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_UPLOAD_BYTES) return 'Files must be 25 MB or smaller.'
  return null
}

export function UploadDropzone({
  onUpload,
  uploading = false,
  error = null,
}: UploadDropzoneProps) {
  const inputId = useId()
  const typeId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState<DocType>('lecture')
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const submit = async (file: File | undefined) => {
    if (!file || uploading) return
    const problem = validateFile(file)
    setFileError(problem)
    if (problem) return
    try {
      await onUpload(file, docType)
    } catch {
      // The mutation error is rendered by the page that owns the request.
    }
  }

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void submit(event.target.files?.[0])
    event.target.value = ''
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    void submit(event.dataTransfer.files?.[0])
  }

  const message = fileError ?? error

  return (
    <div>
      <div className="sm:max-w-[240px]">
        <label htmlFor={typeId} className="field-label">
          Material type
        </label>
        <select
          id={typeId}
          value={docType}
          onChange={(event) => setDocType(event.target.value as DocType)}
          className="field-input"
          disabled={uploading}
        >
          {DOC_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-4 flex flex-col items-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${
          dragging
            ? 'border-brand-500 bg-brand-50/70'
            : 'border-neutral-300 bg-white/40'
        }`}
      >
        <UploadIcon size={28} className="text-neutral-500" />
        <p className="mt-3 text-sm font-semibold text-neutral-900">
          Drag a file here or choose one
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          PDF, DOCX, PPTX, TXT or MD · up to 25 MB
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Handouts are scanned for topics automatically.
        </p>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          aria-label="Upload document"
          className="sr-only"
          onChange={onFileChange}
          disabled={uploading}
        />
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={() => inputRef.current?.click()}
          loading={uploading}
        >
          Choose file
        </Button>
      </div>

      {message ? (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-danger-text">
          <AlertIcon size={16} className="mt-0.5 shrink-0" />
          {message}
        </p>
      ) : null}
    </div>
  )
}
