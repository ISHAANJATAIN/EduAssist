import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deleteDocument,
  listDocuments,
  uploadDocument,
  type DocType,
} from '@/api/documents'

export const documentsKey = ['documents'] as const

export function useDocuments() {
  return useQuery({
    queryKey: documentsKey,
    queryFn: listDocuments,
    refetchInterval: (query) =>
      query.state.data?.some((document) => document.status === 'processing')
        ? 2000
        : false,
  })
}

export function useUploadDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ file, docType }: { file: File; docType: DocType }) =>
      uploadDocument(file, docType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentsKey }),
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (documentId: string) => deleteDocument(documentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentsKey }),
  })
}
