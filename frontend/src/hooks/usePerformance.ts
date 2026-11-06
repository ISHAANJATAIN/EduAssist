import { useQuery } from '@tanstack/react-query'

import { getPerformance, getRecommendations } from '@/api/performance'

export const performanceKey = ['performance'] as const
export const recommendationsKey = ['recommendations'] as const

export function usePerformance() {
  return useQuery({ queryKey: performanceKey, queryFn: getPerformance })
}

export function useRecommendations() {
  return useQuery({
    queryKey: recommendationsKey,
    queryFn: getRecommendations,
  })
}
