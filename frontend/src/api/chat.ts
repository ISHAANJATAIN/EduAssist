import { api } from '@/api/client'
import type { components } from '@/types/api'

export type ChatIntent = NonNullable<components['schemas']['ChatIn']['intent']>
export type ChatOut = components['schemas']['ChatOut']
export type ChatReply = ChatOut['reply']
export type AnswerReply = components['schemas']['AnswerReply']
export type ClarifyReply = components['schemas']['ClarifyReply']
export type PerformanceReply = components['schemas']['PerformanceReply']
export type PlanReply = components['schemas']['PlanReply']
export type Citation = components['schemas']['CitationOut']
export type ChatMessage = components['schemas']['ChatMessageOut']

export async function send(
  message: string,
  intent?: ChatIntent,
): Promise<ChatOut> {
  const { data } = await api.post<ChatOut>('/chat', { message, intent })
  return data
}

export async function history(limit = 50): Promise<ChatMessage[]> {
  const { data } = await api.get<ChatMessage[]>('/chat/history', {
    params: { limit },
  })
  return data
}
