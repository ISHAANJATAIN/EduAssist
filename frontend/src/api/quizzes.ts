import { api } from '@/api/client'
import type { components } from '@/types/api'

export type QuizOut = components['schemas']['QuizOut']
export type QuizItem = QuizOut['items'][number]
export type QuizQuestion = components['schemas']['QuizQuestionOut']
export type Flashcard = components['schemas']['FlashcardOut']
export type QuizCreateIn = components['schemas']['QuizCreateIn']
export type AttemptIn = components['schemas']['AttemptIn']
export type AttemptOut = components['schemas']['AttemptOut']
export type AttemptResult = components['schemas']['AttemptResultOut']

export function isQuestion(item: QuizItem): item is QuizQuestion {
  return 'question' in item
}

export async function create(payload: QuizCreateIn): Promise<QuizOut> {
  const { data } = await api.post<QuizOut>('/quizzes', payload)
  return data
}

export async function get(quizId: string): Promise<QuizOut> {
  const { data } = await api.get<QuizOut>(`/quizzes/${quizId}`)
  return data
}

export async function submitAttempt(
  quizId: string,
  payload: AttemptIn,
): Promise<AttemptOut> {
  const { data } = await api.post<AttemptOut>(
    `/quizzes/${quizId}/attempts`,
    payload,
  )
  return data
}
