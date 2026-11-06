import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createTopic,
  deleteTopic,
  extractTopics,
  listTopics,
  updateTopic,
  type TopicIn,
} from '@/api/topics'

export const topicsKey = ['topics'] as const

export function useTopics() {
  return useQuery({ queryKey: topicsKey, queryFn: listTopics })
}

export function useCreateTopic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: TopicIn) => createTopic(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: topicsKey }),
  })
}

export function useUpdateTopic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ topicId, payload }: { topicId: string; payload: TopicIn }) =>
      updateTopic(topicId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: topicsKey }),
  })
}

export function useDeleteTopic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (topicId: string) => deleteTopic(topicId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: topicsKey }),
  })
}

export function useExtractTopics() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: extractTopics,
    onSuccess: (topics) => queryClient.setQueryData(topicsKey, topics),
  })
}
