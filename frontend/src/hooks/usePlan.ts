import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { createPlan, getLatestPlan, type PlanIn } from '@/api/planner'

import { captureSessionGeneration, isCurrentSession } from '@/store/authStore'

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
    onMutate: captureSessionGeneration,
    onSuccess: (plan, _variables, generation) => {
      if (!isCurrentSession(generation)) return
      queryClient.setQueryData(planKey, plan)
    },
  })
}
