import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

function DialogHarness({ loading = false, mounted = true }: { loading?: boolean; mounted?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Delete material</button>
      {mounted ? (
        <ConfirmDialog
          open={open}
          title="Delete material?"
          confirmLabel="Delete"
          loading={loading}
          onCancel={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        />
      ) : null}
      <button>Outside action</button>
    </>
  )
}

describe('ConfirmDialog', () => {
  it.each(['Cancel', 'Escape', 'Delete'])('restores focus to the opener after %s', async (action) => {
    const user = userEvent.setup()
    render(<DialogHarness />)
    const trigger = screen.getByRole('button', { name: 'Delete material' })
    await user.click(trigger)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    if (action === 'Escape') await user.keyboard('{Escape}')
    else await user.click(screen.getByRole('button', { name: action }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('restores focus when the open dialog is unmounted', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<DialogHarness />)
    const trigger = screen.getByRole('button', { name: 'Delete material' })
    await user.click(trigger)

    rerender(<DialogHarness mounted={false} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('blocks cancellation during a pending destructive request and permits it afterwards', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<DialogHarness />)
    await user.click(screen.getByRole('button', { name: 'Delete material' }))
    rerender(<DialogHarness loading />)

    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel).toBeDisabled()
    await user.click(cancel)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    rerender(<DialogHarness loading={false} />)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete material' })).toHaveFocus()
  })

  it('keeps keyboard focus inside a pending dialog with no enabled controls', async () => {
    const user = userEvent.setup()
    render(<DialogHarness loading />)
    await user.click(screen.getByRole('button', { name: 'Delete material' }))
    const panel = screen.getByRole('dialog')

    expect(panel).toHaveFocus()
    await user.tab()
    expect(panel).toHaveFocus()
    await user.tab({ shift: true })
    expect(panel).toHaveFocus()
  })

  it('wraps keyboard focus between the first and last enabled controls', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)
    await user.click(screen.getByRole('button', { name: 'Delete material' }))
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })
})
