import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createTopic,
  deleteTopic,
  extractTopics,
  listTopics,
  updateTopic,
  type TopicIn,
} from '@/api/topics'

import { captureSessionGeneration, isCurrentSession } from '@/store/authStore'

export const topicsKey = ['topics'] as const

export function useTopics() {
  return useQuery({ queryKey: topicsKey, queryFn: listTopics })
}

export function useCreateTopic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: TopicIn) => createTopic(payload),
    onMutate: captureSessionGeneration,
    onSuccess: (_data, _variables, generation) => {
      if (isCurrentSession(generation)) return queryClient.invalidateQueries({ queryKey: topicsKey })
    },
  })
}

export function useUpdateTopic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ topicId, payload }: { topicId: string; payload: TopicIn }) =>
      updateTopic(topicId, payload),
    onMutate: captureSessionGeneration,
    onSuccess: (_data, _variables, generation) => {
      if (isCurrentSession(generation)) return queryClient.invalidateQueries({ queryKey: topicsKey })
    },
  })
}

export function useDeleteTopic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (topicId: string) => deleteTopic(topicId),
    onMutate: captureSessionGeneration,
    onSuccess: (_data, _variables, generation) => {
      if (isCurrentSession(generation)) return queryClient.invalidateQueries({ queryKey: topicsKey })
    },
  })
}

export function useExtractTopics() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: extractTopics,
    onMutate: captureSessionGeneration,
    onSuccess: (topics, _variables, generation) => {
      if (isCurrentSession(generation)) queryClient.setQueryData(topicsKey, topics)
    },
  })
}
