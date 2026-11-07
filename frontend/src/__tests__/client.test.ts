import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, normalizeError } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { queryClient } from '@/lib/queryClient';

const syntheticUser = { id: 'test', name: 'Test', email: 'test@example.invalid', created_at: '2026-01-01T00:00:00Z' };
function unauthorized(config: InternalAxiosRequestConfig) {
  return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
    config, data: { detail: 'Unauthorized', code: 'unauthorized' }, status: 401, statusText: 'Unauthorized', headers: {},
  });
}

const originalAdapter = api.defaults.adapter;

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ token: null, user: null });
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    vi.unstubAllEnvs();
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

  it.each(['/auth/login', '/auth/register'])('does not attach bearer or clear the session for public %s 401', async (url) => {
    useAuthStore.getState().setSession('current-token', syntheticUser);
    useChatStore.getState().appendUser('private');
    let seen: unknown;
    api.defaults.adapter = async (config) => { seen = config.headers.Authorization; throw unauthorized(config); };
    await expect(api.post(url, {})).rejects.toMatchObject({ code: 'unauthorized' });
    expect(seen).toBeUndefined();
    expect(useAuthStore.getState().token).toBe('current-token');
    expect(useChatStore.getState().messages).toHaveLength(1);
  });

  it('current protected 401 really clears auth, chat and cache in tests', async () => {
    window.history.replaceState(null, '', '/login');
    useAuthStore.getState().setSession('current-token', syntheticUser);
    useChatStore.getState().appendUser('private');
    queryClient.setQueryData(['private'], 'private');
    api.defaults.adapter = async (config) => { throw unauthorized(config); };
    await expect(api.get('/auth/me')).rejects.toMatchObject({ code: 'unauthorized' });
    expect(useAuthStore.getState().token).toBeNull();
    expect(useChatStore.getState().messages).toEqual([]);
    expect(queryClient.getQueryData(['private'])).toBeUndefined();
  });

  it('a deferred A 401 cannot log out B', async () => {
    vi.stubEnv('MODE', 'development');
    window.history.replaceState(null, '', '/login');
    useAuthStore.getState().setSession('a-token', syntheticUser);
    let fail: (() => void) | undefined;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    api.defaults.adapter = (config) => new Promise((_resolve, reject) => { fail = () => reject(unauthorized(config)); started(); });
    const request = api.get('/course').catch((cause: unknown) => cause);
    await ready;
    useAuthStore.getState().setSession('b-token', { ...syntheticUser, id: 'b' });
    useChatStore.getState().appendUser('B private');
    fail!();
    expect(await request).toMatchObject({ code: 'unauthorized' });
    expect(useAuthStore.getState().token).toBe('b-token');
    expect(useChatStore.getState().messages).toHaveLength(1);
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
