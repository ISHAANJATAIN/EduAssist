import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/store/authStore';

const user = {
  id: 'user-1',
  name: 'Ishan Jatain',
  email: 'ishan@bmu.edu.in',
  created_at: '2026-11-03T10:00:00Z',
};

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ token: null, user: null });
  });

  it('stores the session', () => {
    useAuthStore.getState().setSession('token-123', user);

    expect(useAuthStore.getState().token).toBe('token-123');
    expect(useAuthStore.getState().user).toEqual(user);
  });

  it('clears the session on logout', () => {
    useAuthStore.getState().setSession('token-123', user);
    useAuthStore.getState().logout();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('persists the session under the eduassist-auth key', () => {
    useAuthStore.getState().setSession('token-123', user);

    const raw = localStorage.getItem('eduassist-auth');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.token).toBe('token-123');
    expect(JSON.parse(raw!).state.user).toEqual(user);
  });
});
