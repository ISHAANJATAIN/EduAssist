import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, normalizeError } from '@/api/client';
import { useAuthStore } from '@/store/authStore';

const originalAdapter = api.defaults.adapter;

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ token: null, user: null });
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
  });

  it('sends the bearer token from the auth store', async () => {
    useAuthStore.setState({
      token: 'token-123',
      user: {
        id: 'user-1',
        name: 'Ishan Jatain',
        email: 'ishan@bmu.edu.in',
        created_at: '2026-11-03T10:00:00Z',
      },
    });

    let seen: string | undefined;
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
      seen = config.headers.Authorization as string | undefined;
      return {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    api.defaults.adapter = adapter;

    await api.get('/course');

    expect(seen).toBe('Bearer token-123');
  });

  it('normalizes backend error payloads', () => {
    const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
      data: { detail: 'Email already registered.', code: 'email_taken' },
      status: 409,
      statusText: 'Conflict',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    });

    expect(normalizeError(error)).toEqual({
      detail: 'Email already registered.',
      code: 'email_taken',
    });
  });

  it('reports a friendly message when the server is unreachable', () => {
    const error = new AxiosError('Network Error', 'ERR_NETWORK');

    expect(normalizeError(error)).toEqual({
      detail: 'Cannot reach the server. Is the API running?',
      code: 'network_error',
    });
  });
});
