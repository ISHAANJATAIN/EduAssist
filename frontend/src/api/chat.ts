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
export type ChatSession = components['schemas']['ChatSessionOut']
export type ChatSessionLatest = components['schemas']['ChatSessionLatestOut']

export async function send(
  message: string,
  intent?: ChatIntent,
  sessionId?: string | null,
): Promise<ChatOut> {
  const { data } = await api.post<ChatOut>('/chat', {
    message,
    intent,
    session_id: sessionId ?? null,
  })
  return data
}

export async function sessions(): Promise<ChatSession[]> {
  const { data } = await api.get<ChatSession[]>('/chat/sessions')
  return data
}

export async function latest(): Promise<ChatSessionLatest> {
  const { data } = await api.get<ChatSessionLatest>('/chat/sessions/latest')
  return data
}

export async function createSession(): Promise<ChatSession> {
  const { data } = await api.post<ChatSession>('/chat/sessions')
  return data
}

export async function sessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data } = await api.get<ChatMessage[]>(
    `/chat/sessions/${sessionId}/messages`,
  )
  return data
}

export async function clearSession(sessionId: string): Promise<void> {
  await api.delete(`/chat/sessions/${sessionId}/messages`)
}

export async function deleteSession(sessionId: string): Promise<void> {
  await api.delete(`/chat/sessions/${sessionId}`)
}

export async function deleteAllSessions(): Promise<void> {
  await api.delete('/chat/sessions')
}
