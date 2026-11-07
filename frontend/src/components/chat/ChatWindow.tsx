import { useEffect, useRef } from 'react'

import type { ApiError } from '@/api/client'
import { MessageRenderer } from '@/components/chat/MessageRenderer'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { ChatIcon } from '@/components/ui/Icon'
import type { ChatItem } from '@/store/chatStore'

interface ChatWindowProps {
  messages: ChatItem[]
  pending: boolean
  error: ApiError | null
  onRetry: () => void
}

function TypingIndicator() {
  return (
    <div className="flex justify-start" aria-label="EduAssist is thinking">
      <div className="flex items-center gap-1.5 rounded-lg rounded-bl-sm border border-neutral-200/70 bg-neutral-50/95 px-4 py-3 shadow-card">
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-neutral-500"
          style={{ animationDelay: '-0.3s' }}
        />
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-neutral-500"
          style={{ animationDelay: '-0.15s' }}
        />
        <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-500" />
      </div>
    </div>
  )
}

export function ChatWindow({
  messages,
  pending,
  error,
  onRetry,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, pending, error])

  const empty = messages.length === 0 && !pending

  return (
    <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-gold-light/40 bg-paper-deep text-gold">
              <ChatIcon size={28} />
            </div>
            <h2 className="max-w-md text-[26px] font-semibold leading-tight text-ink">
              Ask anything from your uploaded material
            </h2>
            <p className="mt-2 max-w-md text-sm text-neutral-500">
              Answers are grounded in your documents and cite the page they came
              from.
            </p>
          </div>
        ) : (
          <div aria-live="polite" className="mx-auto flex w-full max-w-chat flex-col gap-4">
            {messages.map((message) => (
              <MessageRenderer key={message.id} message={message} />
            ))}
            {pending ? <TypingIndicator /> : null}
          </div>
        )}

        {error ? (
          <div className="mx-auto mt-4 w-full max-w-chat">
            <ErrorBanner error={error} onRetry={onRetry} />
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
