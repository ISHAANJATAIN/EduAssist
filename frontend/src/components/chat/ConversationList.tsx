import type { ChatSession } from '@/api/chat'
import { Button } from '@/components/ui/Button'
import { PlusIcon, TrashIcon } from '@/components/ui/Icon'

interface ConversationListProps {
  sessions: ChatSession[]
  activeId: string | null
  onSelect: (sessionId: string) => void
  onNewChat: () => void
  onClear: () => void
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
              return (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(session.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition duration-200 ${
                      active
                        ? 'bg-action font-semibold text-on-action'
                        : 'text-neutral-700 hover:bg-ink/5 hover:text-ink'
                    }`}
                  >
                    <span className="truncate">
                      {session.title ?? 'New conversation'}
                    </span>
                    <span
                      className={`shrink-0 text-[11px] ${
                        active ? 'text-on-action/70' : 'text-neutral-500'
                      }`}
                    >
                      {formatWhen(session.updated_at)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Button
        variant="ghost"
        onClick={onClear}
        disabled={!canClear}
        className="mt-3 w-full justify-center"
      >
        <TrashIcon size={16} />
        Clear chat
      </Button>
    </aside>
  )
}
