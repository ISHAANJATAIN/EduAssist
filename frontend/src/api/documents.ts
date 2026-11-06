import { api } from '@/api/client'
import type { components } from '@/types/api'

export type DocumentOut = components['schemas']['DocumentOut']
export type DocType = DocumentOut['doc_type']

export const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'lecture', label: 'Lecture' },
  { value: 'slides', label: 'Slides' },
  { value: 'notes', label: 'Notes' },
  { value: 'textbook', label: 'Textbook' },
  { value: 'handout', label: 'Handout / syllabus' },
]

export async function listDocuments(): Promise<DocumentOut[]> {
  const { data } = await api.get<DocumentOut[]>('/documents')
  return data
}

export async function uploadDocument(
  file: File,
  docType: DocType,
): Promise<DocumentOut> {
  const form = new FormData()
  form.append('file', file)
  form.append('doc_type', docType)
  const { data } = await api.post<DocumentOut>('/documents', form)
  return data
}

export async function deleteDocument(documentId: string): Promise<void> {
  await api.delete(`/documents/${documentId}`)
}
