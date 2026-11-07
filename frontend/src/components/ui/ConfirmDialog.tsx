import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel: string
  confirmText?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmText,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const inputId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef(onCancel)
  const [typed, setTyped] = useState('')

  cancelRef.current = onCancel

  useEffect(() => {
    if (!open) return
    setTyped('')

    const panel = panelRef.current
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )

    focusables()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  const canConfirm = !confirmText || typed === confirmText

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070A10]/45 p-4 backdrop-blur-sm">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass-strong w-full max-w-md p-6"
      >
        <h2 id={titleId} className="text-lg font-semibold text-neutral-900">
          {title}
        </h2>
        {description ? (
          <div className="mt-2 text-sm text-neutral-600">{description}</div>
        ) : null}

        {confirmText ? (
          <div className="mt-4">
            <label htmlFor={inputId} className="field-label">
              Type {confirmText} to confirm
            </label>
            <input
              id={inputId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="field-input"
              autoComplete="off"
            />
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => cancelRef.current()}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            loading={loading}
            disabled={!canConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
