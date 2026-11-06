import { normalizeError } from '@/api/client'
import { AlertIcon } from '@/components/ui/Icon'

interface ErrorBannerProps {
  error: unknown
  onRetry?: () => void
}

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  const detail = typeof error === 'string' ? error : normalizeError(error).detail

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-danger/20 bg-danger-bg px-4 py-3 text-sm text-danger-text"
    >
      <AlertIcon size={18} className="mt-0.5 shrink-0" />
      <p className="flex-1">{detail}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold underline underline-offset-2"
        >
          Retry
        </button>
      ) : null}
    </div>
  )
}
