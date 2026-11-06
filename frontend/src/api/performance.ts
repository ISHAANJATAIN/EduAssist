import { api } from '@/api/client'
import type { components } from '@/types/api'

export type PerformanceOut = components['schemas']['PerformanceOut']
export type TopicPerformance = components['schemas']['TopicPerformanceOut']
export type Recommendation = components['schemas']['RecommendationOut']
export type MasteryStatus = TopicPerformance['status']

export async function getPerformance(): Promise<PerformanceOut> {
  const { data } = await api.get<PerformanceOut>('/performance')
  return data
}

export async function getRecommendations(): Promise<Recommendation[]> {
  const { data } = await api.get<Recommendation[]>('/recommendations')
  return data
}
