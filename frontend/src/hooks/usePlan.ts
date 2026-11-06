import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { createPlan, getLatestPlan, type PlanIn } from '@/api/planner'

export const planKey = ['plan', 'latest'] as const

export function useLatestPlan() {
  return useQuery({
    queryKey: planKey,
    queryFn: getLatestPlan,
    retry: false,
  })
}

export function useCreatePlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: PlanIn) => createPlan(payload),
    onSuccess: (plan) => {
      queryClient.setQueryData(planKey, plan)
    },
  })
}
