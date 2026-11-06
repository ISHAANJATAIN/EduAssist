import { api } from '@/api/client'

export async function deleteMyData(): Promise<void> {
  await api.delete('/me/data')
}
