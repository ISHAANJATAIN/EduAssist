import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { MessageRenderer } from '@/components/chat/MessageRenderer'
import type { ChatItem } from '@/store/chatStore'

const CREATED_AT = '2026-11-04T10:00:00Z'

function assistant(reply: ChatItem['reply']): ChatItem {
  return { id: 'assistant-1', role: 'assistant', created_at: CREATED_AT, reply }
}

describe('MessageRenderer', () => {
  it('renders a grounded answer with its sources', () => {
    render(
      <MessageRenderer
        message={assistant({
          type: 'answer',
          text: 'A deadlock is a circular wait between processes.',
          grounded: true,
          citations: [
            {
              document_id: '3f2f1c1e-8c1f-4f4e-9f6a-2b1c1d1e1f10',
              filename: 'notes.pdf',
              page: 2,
              snippet: 'A deadlock is a circular wait.',
            },
          ],
        })}
      />,
    )

    expect(
      screen.getByText('A deadlock is a circular wait between processes.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Sources')).toBeInTheDocument()
    expect(screen.getByText('notes.pdf · p.2')).toBeInTheDocument()
    expect(
      screen.queryByText("This isn't covered in your uploaded material."),
    ).not.toBeInTheDocument()
  })

  it('shows the not-covered banner without sources', () => {
    render(
      <MessageRenderer
        message={assistant({
          type: 'answer',
          text: "I couldn't find this in your uploaded material.",
          grounded: false,
          citations: [],
        })}
      />,
    )

    expect(
      screen.getByText("This isn't covered in your uploaded material."),
    ).toBeInTheDocument()
    expect(screen.queryByText('Sources')).not.toBeInTheDocument()
  })

  it('renders a clarify reply with the missing detail', () => {
    render(
      <MemoryRouter>
        <MessageRenderer
          message={assistant({
            type: 'clarify',
            text: 'I need your exam date before I can build a study plan.',
            missing: ['exam_date'],
          })}
        />
      </MemoryRouter>,
    )

    expect(
      screen.getByText(
        'I need your exam date before I can build a study plan.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Exam date')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open planner' })).toHaveAttribute(
      'href',
      '/planner',
    )
  })

  it('renders a user message', () => {
    render(
      <MessageRenderer
        message={{
          id: 'user-1',
          role: 'user',
          created_at: CREATED_AT,
          text: 'Explain deadlocks',
        }}
      />,
    )

    expect(screen.getByText('Explain deadlocks')).toBeInTheDocument()
  })
})
