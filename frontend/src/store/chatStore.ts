import { create } from 'zustand'

import type { ApiError } from '@/api/client'
import type { ChatMessage, ChatOut, ChatReply, ChatSession } from '@/api/chat'

export interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  created_at: string
  text?: string | null
  reply?: ChatReply | null
}

interface ChatState {
  messages: ChatItem[]
  session: ChatSession | null
  sessions: ChatSession[]
  pending: boolean
  error: ApiError | null
  hydrated: boolean
  hydrate: (session: ChatSession | null, messages: ChatMessage[]) => void
  setSession: (session: ChatSession) => void
  setSessions: (sessions: ChatSession[]) => void
  beginNewChat: () => void
  clearMessages: () => void
  removeSession: (sessionId: string) => void
  clearSessions: () => void
  appendUser: (text: string) => void
  appendAssistant: (message: ChatOut) => void
  setPending: (pending: boolean) => void
  setError: (error: ApiError | null) => void
  reset: () => void
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  session: null,
  sessions: [],
  pending: false,
  error: null,
  hydrated: false,

  hydrate: (session, messages) =>
    set({
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        created_at: message.created_at,
        text: message.text,
        reply: message.reply,
      })),
      session,
      hydrated: true,
      error: null,
    }),

  setSession: (session) => set({ session }),
  setSessions: (sessions) => set({ sessions }),

  beginNewChat: () =>
    set({
      messages: [],
      session: null,
      pending: false,
      error: null,
      hydrated: true,
    }),

  clearMessages: () => set({ messages: [], error: null }),

  removeSession: (sessionId) =>
    set((state) => {
      const sessions = state.sessions.filter((item) => item.id !== sessionId)
      if (state.session?.id !== sessionId) return { sessions }
      return {
        sessions,
        messages: [],
        session: null,
        pending: false,
        error: null,
        hydrated: true,
      }
    }),

  clearSessions: () =>
    set({
      messages: [],
      session: null,
      sessions: [],
      pending: false,
      error: null,
      hydrated: true,
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
    set({
      messages: [],
      session: null,
      sessions: [],
      pending: false,
      error: null,
      hydrated: false,
    }),
}))
