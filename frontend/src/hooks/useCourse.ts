import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getCourse, updateCourse, type CourseUpdate } from '@/api/course'

import { captureSessionGeneration, isCurrentSession } from '@/store/authStore'

export const courseKey = ['course'] as const

export function useCourse() {
  return useQuery({ queryKey: courseKey, queryFn: getCourse })
}

export function useUpdateCourse() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CourseUpdate) => updateCourse(payload),
    onMutate: captureSessionGeneration,
    onSuccess: (course, _variables, generation) => {
      if (isCurrentSession(generation)) queryClient.setQueryData(courseKey, course)
    },
  })
}
