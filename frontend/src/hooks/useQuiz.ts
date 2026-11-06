import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  create,
  submitAttempt,
  type AttemptIn,
  type QuizCreateIn,
} from '@/api/quizzes'

export function useCreateQuiz() {
  return useMutation({
    mutationFn: (payload: QuizCreateIn) => create(payload),
  })
}

export function useSubmitAttempt() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      quizId,
      payload,
    }: {
      quizId: string
      payload: AttemptIn
    }) => submitAttempt(quizId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['performance'] })
      queryClient.invalidateQueries({ queryKey: ['recommendations'] })
    },
  })
}
