import { ChatWindow } from '@/components/chat/ChatWindow'
import { MessageInput } from '@/components/chat/MessageInput'
import { useChat } from '@/hooks/useChat'

export function ChatPage() {
  const { messages, pending, error, send, retry } = useChat()

  return (
    <section className="mx-auto flex h-[calc(100dvh-7rem)] w-full max-w-chat flex-col gap-3">
      <ChatWindow
        messages={messages}
        pending={pending}
        error={error}
        onRetry={retry}
      />
      <MessageInput onSend={send} disabled={pending} />
    </section>
  )
}
