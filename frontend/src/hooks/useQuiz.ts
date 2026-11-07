import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  create,
  submitAttempt,
  type AttemptIn,
  type QuizCreateIn,
} from '@/api/quizzes'

import { captureSessionGeneration, isCurrentSession } from '@/store/authStore'

export function useCreateQuiz() {
  return useMutation({
    mutationFn: (payload: QuizCreateIn) => create(payload),
  })
}

export function useSubmitAttempt() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({
      quizId,
      payload,
    }: {
      quizId: string
      payload: AttemptIn
    }) => submitAttempt(quizId, payload),
    onMutate: captureSessionGeneration,
    onSuccess: (_data, _variables, generation) => {
      if (!isCurrentSession(generation)) return
      queryClient.invalidateQueries({ queryKey: ['performance'] })
      queryClient.invalidateQueries({ queryKey: ['recommendations'] })
    },
  })

  // Quiz consumers also write local state in per-call callbacks. Query clear()
  // does not suppress those callbacks while the consumer remains mounted.
  const guardCallbacks = (
    options: Parameters<typeof mutation.mutate>[1],
  ): NonNullable<Parameters<typeof mutation.mutate>[1]> => {
    const generation = captureSessionGeneration()
    return {
      ...options,
      onSuccess: (...args) => { if (isCurrentSession(generation)) options?.onSuccess?.(...args) },
      onError: (...args) => { if (isCurrentSession(generation)) options?.onError?.(...args) },
      onSettled: (...args) => { if (isCurrentSession(generation)) options?.onSettled?.(...args) },
    }
  }
  const mutate: typeof mutation.mutate = (variables, options) =>
    mutation.mutate(variables, guardCallbacks(options))
  const mutateAsync: typeof mutation.mutateAsync = (variables, options) =>
    mutation.mutateAsync(variables, guardCallbacks(options))

  return { ...mutation, mutate, mutateAsync }
}
