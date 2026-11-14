import type { ChatSession } from '@/api/chat'
import { Button } from '@/components/ui/Button'
import { PlusIcon, TrashIcon } from '@/components/ui/Icon'

interface ConversationListProps {
  sessions: ChatSession[]
  activeId: string | null
  onSelect: (sessionId: string) => void
  onNewChat: () => void
  onClear: () => void
  onDelete: (sessionId: string) => void
  onDeleteAll: () => void
  canClear: boolean
}

function formatWhen(iso: string): string {
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return ''
  const minutes = Math.floor((Date.now() - when.getTime()) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function ConversationList({
  sessions,
  activeId,
  onSelect,
  onNewChat,
  onClear,
  onDelete,
  onDeleteAll,
  canClear,
}: ConversationListProps) {
  return (
    <aside className="glass hidden min-h-0 w-64 shrink-0 flex-col p-3 lg:flex">
      <Button
        variant="primary"
        onClick={onNewChat}
        className="w-full justify-center"
      >
        <PlusIcon size={16} />
        New chat
      </Button>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        <h2 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Conversations
        </h2>
        {sessions.length === 0 ? (
          <p className="px-2 py-3 text-sm text-neutral-500">
            No conversations yet. Send a message to start one.
          </p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((session) => {
              const active = session.id === activeId
              const title = session.title ?? 'New conversation'
              return (
                <li key={session.id}>
                  <div
                    className={`group flex items-center gap-1 rounded-xl pr-1 transition duration-200 ${
                      active ? 'bg-action' : 'hover:bg-ink/5'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(session.id)}
                      aria-current={active ? 'true' : undefined}
                      className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition duration-200 ${
                        active
                          ? 'font-semibold text-on-action'
                          : 'text-neutral-700 group-hover:text-ink'
                      }`}
                    >
                      <span className="truncate">{title}</span>
                      <span
                        className={`shrink-0 text-[11px] ${
                          active ? 'text-on-action/70' : 'text-neutral-500'
                        }`}
                      >
                        {formatWhen(session.updated_at)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(session.id)}
                      aria-label={`Delete ${title}`}
                      title={`Delete ${title}`}
                      className={`shrink-0 rounded-lg p-1.5 transition duration-200 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 ${
                        active
                          ? 'text-on-action/70 opacity-100 hover:bg-white/15 hover:text-on-action'
                          : 'text-neutral-400 opacity-0 hover:bg-danger/10 hover:text-danger'
                      }`}
                    >
                      <TrashIcon size={15} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="mt-3 space-y-1">
        <Button
          variant="ghost"
          onClick={onClear}
          disabled={!canClear}
          className="w-full justify-center"
        >
          <TrashIcon size={16} />
          Clear chat
        </Button>
        <Button
          variant="ghost"
          onClick={onDeleteAll}
          disabled={sessions.length === 0}
          className="w-full justify-center text-danger hover:bg-danger/10 hover:text-danger"
        >
          <TrashIcon size={16} />
          Delete all chats
        </Button>
      </div>
    </aside>
  )
}
