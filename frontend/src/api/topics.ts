import { api } from '@/api/client'
import type { components } from '@/types/api'

export type TopicOut = components['schemas']['TopicOut']
export type TopicIn = components['schemas']['TopicIn']

export async function listTopics(): Promise<TopicOut[]> {
  const { data } = await api.get<TopicOut[]>('/topics')
  return data
}

export async function createTopic(payload: TopicIn): Promise<TopicOut> {
  const { data } = await api.post<TopicOut>('/topics', payload)
  return data
}

export async function updateTopic(
  topicId: string,
  payload: TopicIn,
): Promise<TopicOut> {
  const { data } = await api.put<TopicOut>(`/topics/${topicId}`, payload)
  return data
}

export async function deleteTopic(topicId: string): Promise<void> {
  await api.delete(`/topics/${topicId}`)
}

export async function extractTopics(): Promise<TopicOut[]> {
  const { data } = await api.post<TopicOut[]>('/topics/extract')
  return data
}
