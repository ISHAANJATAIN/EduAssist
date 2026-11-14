import { useState } from 'react'

import type { ChatSession } from '@/api/chat'
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
    deleteChat,
    deleteAllChats,
    deleting,
    deletingAll,
    deleteError,
    deleteAllError,
    resetDelete,
    historyLoading,
    historyError,
    retryHistory,
  } = useChat()
  const [confirmClear, setConfirmClear] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)

  const canClear = Boolean(session) && messages.length > 0

  const openDelete = (sessionId: string) => {
    const target = sessions.find((item) => item.id === sessionId)
    if (!target) return
    resetDelete()
    setDeleteTarget(target)
  }

  const openDeleteAll = () => {
    resetDelete()
    setConfirmDeleteAll(true)
  }

  const runDelete = () => {
    if (!deleteTarget) return
    void deleteChat(deleteTarget.id).then(
      () => setDeleteTarget(null),
      () => {},
    )
  }

  const runDeleteAll = () => {
    void deleteAllChats().then(
      () => setConfirmDeleteAll(false),
      () => {},
    )
  }

  return (
    <section className="mx-auto flex h-[calc(100dvh-7rem)] w-full max-w-content gap-4">
      <ConversationList
        sessions={sessions}
        activeId={session?.id ?? null}
        onSelect={(sessionId) => void openSession(sessionId)}
        onNewChat={newChat}
        onClear={() => setConfirmClear(true)}
        onDelete={openDelete}
        onDeleteAll={openDeleteAll}
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
            onClick={() => {
              if (session) openDelete(session.id)
            }}
            disabled={!session}
            aria-label="Delete this chat"
            className="shrink-0 px-3 text-danger hover:bg-danger/10 hover:text-danger"
          >
            <TrashIcon size={18} />
          </Button>
        </div>
        {sessions.length > 0 ? (
          <div className="flex justify-end lg:hidden">
            <Button
              variant="ghost"
              onClick={openDeleteAll}
              className="h-8 px-3 text-xs text-danger hover:bg-danger/10 hover:text-danger"
            >
              <TrashIcon size={14} />
              Delete all chats
            </Button>
          </div>
        ) : null}

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

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this conversation?"
        description={
          <>
            <p>
              This removes{' '}
              <strong>{deleteTarget?.title ?? 'this conversation'}</strong> and
              every message in it. Your other conversations stay.{' '}
              <strong>This cannot be undone.</strong>
            </p>
            {deleteError ? (
              <div className="mt-3">
                <ErrorBanner error={deleteError} />
              </div>
            ) : null}
          </>
        }
        confirmLabel="Delete conversation"
        confirmText="DELETE"
        loading={deleting}
        onConfirm={runDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={confirmDeleteAll}
        title="Delete all conversations?"
        description={
          <>
            <p>
              This removes every conversation and every message in your chat
              history. <strong>This cannot be undone.</strong>
            </p>
            {deleteAllError ? (
              <div className="mt-3">
                <ErrorBanner error={deleteAllError} />
              </div>
            ) : null}
          </>
        }
        confirmLabel="Delete all chats"
        confirmText="DELETE ALL"
        loading={deletingAll}
        onConfirm={runDeleteAll}
        onCancel={() => setConfirmDeleteAll(false)}
      />
    </section>
  )
}
