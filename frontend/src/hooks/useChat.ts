import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { normalizeError } from '@/api/client'
import {
  clearSession,
  latest as fetchLatest,
  send as sendMessage,
  sessionMessages,
  sessions as fetchSessions,
  type ChatIntent,
  type ChatSession,
} from '@/api/chat'
import { planKey } from '@/hooks/usePlan'
import { captureSessionGeneration, isCurrentSession, useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'

export const chatLatestKey = ['chat', 'latest'] as const
export const chatSessionsKey = ['chat', 'sessions'] as const

interface SendVariables {
  message: string
  intent?: ChatIntent
  appendUser: boolean
  generation: number
}

function touchedSession(session: ChatSession): ChatSession {
  return { ...session, updated_at: new Date().toISOString() }
}

export function useChat() {
  const queryClient = useQueryClient()
  const generation = useAuthStore((state) => state.generation)
  const token = useAuthStore((state) => state.token)
  const messages = useChatStore((state) => state.messages)
  const session = useChatStore((state) => state.session)
  const sessions = useChatStore((state) => state.sessions)
  const pending = useChatStore((state) => state.pending)
  const error = useChatStore((state) => state.error)
  const hydrated = useChatStore((state) => state.hydrated)
  const hydrate = useChatStore((state) => state.hydrate)
  const setSessions = useChatStore((state) => state.setSessions)

  const latestQuery = useQuery({
    queryKey: [...chatLatestKey, generation],
    queryFn: fetchLatest,
    enabled: Boolean(token),
    staleTime: Infinity,
    retry: false,
  })

  const sessionsQuery = useQuery({
    queryKey: [...chatSessionsKey, generation],
    queryFn: fetchSessions,
    enabled: Boolean(token),
    staleTime: Infinity,
    retry: false,
  })

  useEffect(() => {
    if (!isCurrentSession(generation) || !latestQuery.data || hydrated) return
    hydrate(latestQuery.data.session ?? null, latestQuery.data.messages ?? [])
  }, [generation, latestQuery.data, hydrated, hydrate])

  useEffect(() => {
    if (!isCurrentSession(generation) || !sessionsQuery.data) return
    setSessions(sessionsQuery.data)
  }, [generation, sessionsQuery.data, setSessions])

  const mutation = useMutation({
    mutationFn: ({ message, intent }: SendVariables) =>
      sendMessage(message, intent, useChatStore.getState().session?.id ?? null),
    onMutate: (variables) => {
      if (!isCurrentSession(variables.generation)) return
      const store = useChatStore.getState()
      if (variables.appendUser) store.appendUser(variables.message)
      store.setError(null)
      store.setPending(true)
    },
    onSuccess: (data, variables) => {
      if (!isCurrentSession(variables.generation)) return
      const store = useChatStore.getState()
      store.appendAssistant(data)
      const known = store.sessions.find((item) => item.id === data.session_id)
      const active = store.session
      if (active && active.id === data.session_id) {
        const updated = touchedSession(active)
        store.setSession(updated)
        store.setSessions(
          store.sessions.map((item) => (item.id === updated.id ? updated : item)),
        )
      } else if (!known) {
        const now = new Date().toISOString()
        const created: ChatSession = {
          id: data.session_id,
          title: variables.message.slice(0, 60),
          created_at: now,
          updated_at: now,
        }
        store.setSession(created)
        store.setSessions([created, ...store.sessions])
      } else {
        store.setSession(touchedSession(known))
      }
      if (data.reply.type === 'plan') queryClient.setQueryData(planKey, data.reply.plan)
    },
    onError: (cause, variables) => {
      if (!isCurrentSession(variables.generation)) return
      const store = useChatStore.getState()
      store.setPending(false)
      store.setError(normalizeError(cause))
    },
  })

  const currentMutation = isCurrentSession(mutation.variables?.generation)
  const canSend = Boolean(token) && hydrated && !pending && !(mutation.isPending && currentMutation)
  const send = (message: string, intent?: ChatIntent) => {
    if (!canSend || !isCurrentSession(generation)) return
    mutation.mutate({ message, intent, appendUser: true, generation: captureSessionGeneration() })
  }

  const canRetry = Boolean(mutation.variables && isCurrentSession(mutation.variables.generation))
  const retry = () => {
    if (canSend && canRetry && mutation.variables && isCurrentSession(mutation.variables.generation)) {
      mutation.mutate({ ...mutation.variables, appendUser: false })
    }
  }

  const clearMutation = useMutation({
    mutationFn: (sessionId: string) => clearSession(sessionId),
    onSuccess: (_, sessionId) => {
      if (!isCurrentSession(generation)) return
      const store = useChatStore.getState()
      if (store.session?.id === sessionId) store.clearMessages()
    },
  })

  const openSession = async (sessionId: string) => {
    if (!isCurrentSession(generation)) return
    const target = useChatStore.getState().sessions.find((item) => item.id === sessionId)
    try {
      const rows = await sessionMessages(sessionId)
      if (!isCurrentSession(generation)) return
      if (target) hydrate(target, rows)
    } catch (cause) {
      if (!isCurrentSession(generation)) return
      useChatStore.getState().setError(normalizeError(cause))
    }
  }

  const newChat = () => {
    if (!isCurrentSession(generation)) return
    useChatStore.getState().beginNewChat()
  }

  const clearChat = () => {
    const sessionId = useChatStore.getState().session?.id
    if (!sessionId || clearMutation.isPending) return
    clearMutation.mutate(sessionId)
  }

  return {
    messages,
    sessions,
    session,
    pending,
    error,
    send,
    retry,
    canRetry,
    canSend,
    openSession,
    newChat,
    clearChat,
    clearing: clearMutation.isPending,
    historyLoading: Boolean(token) && !hydrated && latestQuery.isFetching,
    historyError: latestQuery.error,
    retryHistory: () => {
      void latestQuery.refetch()
      void sessionsQuery.refetch()
    },
  }
}
