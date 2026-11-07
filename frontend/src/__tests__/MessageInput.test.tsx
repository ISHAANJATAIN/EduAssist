import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MessageInput } from '@/components/chat/MessageInput'

describe('MessageInput', () => {
  it('blocks every quick action while disabled and enables them again afterwards', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    const { rerender } = render(<MessageInput onSend={onSend} disabled />)
    const actions = within(screen.getByRole('group', { name: 'Quick actions' }))

    for (const button of actions.getAllByRole('button')) {
      await user.click(button)
    }
    expect(onSend).not.toHaveBeenCalled()
    for (const button of actions.getAllByRole('button')) {
      expect(button).toBeDisabled()
    }

    rerender(<MessageInput onSend={onSend} />)
    for (const button of actions.getAllByRole('button')) {
      await user.click(button)
    }
    expect(onSend.mock.calls).toEqual([
      ['Quiz me', 'quiz'],
      ['Flashcards', 'quiz'],
      ['My progress', 'tracker'],
      ['Plan my revision', 'planner'],
    ])
  })

  it('allows drafting while disabled but cannot send until re-enabled', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    const { rerender } = render(<MessageInput onSend={onSend} disabled />)
    const message = screen.getByRole('textbox', { name: 'Message' })

    await user.type(message, '  Explain paging  {Enter}')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    expect(onSend).not.toHaveBeenCalled()
    expect(message).toHaveValue('  Explain paging  ')

    rerender(<MessageInput onSend={onSend} />)
    await user.click(message)
    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledExactlyOnceWith('Explain paging')
    expect(message).toHaveValue('')
  })
})
