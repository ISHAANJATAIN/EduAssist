import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { normalizeError } from '@/api/client'
import { history as fetchHistory, send as sendMessage, type ChatIntent } from '@/api/chat'
import { planKey } from '@/hooks/usePlan'
import { captureSessionGeneration, isCurrentSession, useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'

export const chatHistoryKey = ['chat', 'history'] as const

interface SendVariables {
  message: string
  intent?: ChatIntent
  appendUser: boolean
  generation: number
}

export function useChat() {
  const queryClient = useQueryClient()
  const generation = useAuthStore((state) => state.generation)
  const token = useAuthStore((state) => state.token)
  const messages = useChatStore((state) => state.messages)
  const pending = useChatStore((state) => state.pending)
  const error = useChatStore((state) => state.error)
  const hydrated = useChatStore((state) => state.hydrated)
  const setHistory = useChatStore((state) => state.setHistory)

  const historyQuery = useQuery({
    queryKey: [...chatHistoryKey, generation],
    queryFn: () => fetchHistory(),
    enabled: Boolean(token),
    staleTime: Infinity,
    retry: false,
  })

  useEffect(() => {
    if (isCurrentSession(generation) && historyQuery.data && !hydrated) setHistory(historyQuery.data)
  }, [generation, historyQuery.data, hydrated, setHistory])

  const mutation = useMutation({
    mutationFn: ({ message, intent }: SendVariables) => sendMessage(message, intent),
    onMutate: (variables) => {
      if (!isCurrentSession(variables.generation)) return
      const store = useChatStore.getState()
      if (variables.appendUser) store.appendUser(variables.message)
      store.setError(null)
      store.setPending(true)
    },
    onSuccess: (data, variables) => {
      if (!isCurrentSession(variables.generation)) return
      useChatStore.getState().appendAssistant(data)
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

  return {
    messages, pending, error, send, retry, canRetry, canSend,
    historyLoading: Boolean(token) && !hydrated && historyQuery.isFetching,
    historyError: historyQuery.error,
    retryHistory: () => void historyQuery.refetch(),
  }
}
