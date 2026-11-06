import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { normalizeError } from '@/api/client'
import {
  history as fetchHistory,
  send as sendMessage,
  type ChatIntent,
} from '@/api/chat'
import { planKey } from '@/hooks/usePlan'
import { useChatStore } from '@/store/chatStore'

export const chatHistoryKey = ['chat', 'history'] as const

interface SendVariables {
  message: string
  intent?: ChatIntent
  appendUser: boolean
}

export function useChat() {
  const queryClient = useQueryClient()
  const messages = useChatStore((state) => state.messages)
  const pending = useChatStore((state) => state.pending)
  const error = useChatStore((state) => state.error)
  const hydrated = useChatStore((state) => state.hydrated)
  const setHistory = useChatStore((state) => state.setHistory)

  const historyQuery = useQuery({
    queryKey: chatHistoryKey,
    queryFn: () => fetchHistory(),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (historyQuery.data && !hydrated) setHistory(historyQuery.data)
  }, [historyQuery.data, hydrated, setHistory])

  const mutation = useMutation({
    mutationFn: ({ message, intent }: SendVariables) =>
      sendMessage(message, intent),
    onMutate: (variables) => {
      const store = useChatStore.getState()
      if (variables.appendUser) store.appendUser(variables.message)
      store.setError(null)
      store.setPending(true)
    },
    onSuccess: (data) => {
      useChatStore.getState().appendAssistant(data)
      if (data.reply.type === 'plan') {
        queryClient.setQueryData(planKey, data.reply.plan)
      }
    },
    onError: (cause) => {
      const store = useChatStore.getState()
      store.setPending(false)
      store.setError(normalizeError(cause))
    },
  })

  const send = (message: string, intent?: ChatIntent) =>
    mutation.mutate({ message, intent, appendUser: true })

  const retry = () => {
    const variables = mutation.variables
    if (variables) mutation.mutate({ ...variables, appendUser: false })
  }

  return {
    messages,
    pending,
    error,
    send,
    retry,
    canRetry: Boolean(mutation.variables),
  }
}
