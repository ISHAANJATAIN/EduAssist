import { api } from '@/api/client'
import type { components } from '@/types/api'

export type RegisterIn = components['schemas']['RegisterIn']
export type LoginIn = components['schemas']['LoginIn']
export type TokenOut = components['schemas']['TokenOut']
export type UserOut = components['schemas']['UserOut']

export async function register(payload: RegisterIn): Promise<TokenOut> {
  const { data } = await api.post<TokenOut>('/auth/register', payload)
  return data
}

export async function login(payload: LoginIn): Promise<TokenOut> {
  const { data } = await api.post<TokenOut>('/auth/login', payload)
  return data
}

export async function me(): Promise<UserOut> {
  const { data } = await api.get<UserOut>('/auth/me')
  return data
}
