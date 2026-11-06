import { create } from 'zustand'

import type { ApiError } from '@/api/client'
import type { ChatMessage, ChatOut, ChatReply } from '@/api/chat'

export interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  created_at: string
  text?: string | null
  reply?: ChatReply | null
}

interface ChatState {
  messages: ChatItem[]
  pending: boolean
  error: ApiError | null
  hydrated: boolean
  setHistory: (messages: ChatMessage[]) => void
  appendUser: (text: string) => void
  appendAssistant: (message: ChatOut) => void
  setPending: (pending: boolean) => void
  setError: (error: ApiError | null) => void
  reset: () => void
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  pending: false,
  error: null,
  hydrated: false,

  setHistory: (messages) =>
    set({
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        created_at: message.created_at,
        text: message.text,
        reply: message.reply,
      })),
      hydrated: true,
      error: null,
    }),

  appendUser: (text) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: `local-${Date.now()}-${state.messages.length}`,
          role: 'user',
          created_at: new Date().toISOString(),
          text,
        },
      ],
    })),

  appendAssistant: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: message.message_id,
          role: 'assistant',
          created_at: new Date().toISOString(),
          reply: message.reply,
        },
      ],
      pending: false,
    })),

  setPending: (pending) => set({ pending }),
  setError: (error) => set({ error }),
  reset: () =>
    set({ messages: [], pending: false, error: null, hydrated: false }),
}))
