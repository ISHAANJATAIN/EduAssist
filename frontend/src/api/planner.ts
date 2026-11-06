import { api } from '@/api/client'
import type { components } from '@/types/api'

export type PlanIn = components['schemas']['PlanIn']
export type PlanOut = components['schemas']['PlanOut']
export type PlanDay = components['schemas']['PlanDayOut']
export type PlanSlot = components['schemas']['PlanSlotOut']

export async function createPlan(payload: PlanIn): Promise<PlanOut> {
  const { data } = await api.post<PlanOut>('/plans', payload)
  return data
}

export async function getLatestPlan(): Promise<PlanOut> {
  const { data } = await api.get<PlanOut>('/plans/latest')
  return data
}
