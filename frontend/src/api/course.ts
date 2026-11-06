import { api } from '@/api/client'
import type { components } from '@/types/api'

export type CourseOut = components['schemas']['CourseOut']
export type CourseUpdate = components['schemas']['CourseUpdate']

export async function getCourse(): Promise<CourseOut> {
  const { data } = await api.get<CourseOut>('/course')
  return data
}

export async function updateCourse(payload: CourseUpdate): Promise<CourseOut> {
  const { data } = await api.put<CourseOut>('/course', payload)
  return data
}
