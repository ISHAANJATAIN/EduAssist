import { useState } from 'react'

import { ConversationList } from '@/components/chat/ConversationList'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { MessageInput } from '@/components/chat/MessageInput'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PlusIcon, TrashIcon } from '@/components/ui/Icon'
import { useChat } from '@/hooks/useChat'

export function ChatPage() {
  const {
    messages,
    sessions,
    session,
    pending,
    error,
    send,
    retry,
    canSend,
    openSession,
    newChat,
    clearChat,
    clearing,
    historyLoading,
    historyError,
    retryHistory,
  } = useChat()
  const [confirmClear, setConfirmClear] = useState(false)

  const canClear = Boolean(session) && messages.length > 0

  return (
    <section className="mx-auto flex h-[calc(100dvh-7rem)] w-full max-w-content gap-4">
      <ConversationList
        sessions={sessions}
        activeId={session?.id ?? null}
        onSelect={(sessionId) => void openSession(sessionId)}
        onNewChat={newChat}
        onClear={() => setConfirmClear(true)}
        canClear={canClear}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2 lg:hidden">
          <Button variant="secondary" onClick={newChat} className="shrink-0">
            <PlusIcon size={16} />
            New chat
          </Button>
          <label htmlFor="conversation-select" className="sr-only">
            Conversation
          </label>
          <select
            id="conversation-select"
            value={session?.id ?? ''}
            onChange={(event) => {
              if (event.target.value) void openSession(event.target.value)
            }}
            className="field-input h-10 min-w-0 flex-1 rounded-full px-3"
          >
            <option value="">New conversation</option>
            {sessions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title ?? 'New conversation'}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            onClick={() => setConfirmClear(true)}
            disabled={!canClear}
            aria-label="Clear chat"
            className="shrink-0 px-3"
          >
            <TrashIcon size={18} />
          </Button>
        </div>

        {historyLoading ? (
          <p role="status" className="text-sm text-neutral-600">
            Loading chat history…
          </p>
        ) : null}
        {historyError ? (
          <ErrorBanner error={historyError} onRetry={retryHistory} />
        ) : null}
        <ChatWindow
          messages={messages}
          pending={pending}
          error={error}
          onRetry={retry}
        />
        <MessageInput onSend={send} disabled={!canSend} />
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear this chat?"
        description="This removes every message in this conversation. Your other conversations stay."
        confirmLabel="Clear chat"
        confirmText="CLEAR"
        loading={clearing}
        onConfirm={() => {
          clearChat()
          setConfirmClear(false)
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </section>
  )
}
