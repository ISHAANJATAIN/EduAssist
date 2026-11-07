import { ChatWindow } from '@/components/chat/ChatWindow'
import { MessageInput } from '@/components/chat/MessageInput'
import { useChat } from '@/hooks/useChat'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

export function ChatPage() {
  const { messages, pending, error, send, retry, canSend, historyLoading, historyError, retryHistory } = useChat()

  return (
    <section className="mx-auto flex h-[calc(100dvh-7rem)] w-full max-w-chat flex-col gap-3">
      {historyLoading ? <p role="status" className="text-sm text-neutral-600">Loading chat history…</p> : null}
      {historyError ? <ErrorBanner error={historyError} onRetry={retryHistory} /> : null}
      <ChatWindow
        messages={messages}
        pending={pending}
        error={error}
        onRetry={retry}
      />
      <MessageInput onSend={send} disabled={!canSend} />
    </section>
  )
}
