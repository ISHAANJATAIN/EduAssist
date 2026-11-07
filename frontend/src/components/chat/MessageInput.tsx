import { useState, type KeyboardEvent } from 'react'

import type { ChatIntent } from '@/api/chat'
import { Button } from '@/components/ui/Button'
import { SendIcon } from '@/components/ui/Icon'

interface MessageInputProps {
  onSend: (message: string, intent?: ChatIntent) => void
  disabled?: boolean
}

const QUICK_ACTIONS: ReadonlyArray<{
  label: string
  intent: ChatIntent
}> = [
  { label: 'Quiz me', intent: 'quiz' },
  { label: 'Flashcards', intent: 'quiz' },
  { label: 'My progress', intent: 'tracker' },
  { label: 'Plan my revision', intent: 'planner' },
]

export function MessageInput({ onSend, disabled = false }: MessageInputProps) {
  const [value, setValue] = useState('')

  const submit = () => {
    const message = value.trim()
    if (!message || disabled) return
    onSend(message)
    setValue('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="glass-strong p-3">
      <div
        role="group"
        aria-label="Quick actions"
        className="flex flex-wrap gap-2 pb-3"
      >
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => onSend(action.label, action.intent)}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-paper-card px-3 py-1.5 text-xs font-semibold text-neutral-700 transition duration-200 hover:-translate-y-0.5 hover:border-ink/35 hover:text-ink"
          >
            {action.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="flex items-end gap-2"
      >
        <label htmlFor="chat-message" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-message"
          rows={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your material…"
          className="max-h-40 min-h-11 flex-1 resize-none rounded-[22px] border border-neutral-300 bg-paper-card px-4 py-2.5 text-base text-neutral-900 transition placeholder:text-neutral-500 hover:border-ink/30 focus:border-ink"
        />
        <Button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          aria-label="Send message"
          className="shrink-0"
        >
          <SendIcon size={18} />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>
    </div>
  )
}
