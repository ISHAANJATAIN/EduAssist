import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTheme, resolveInitialTheme, setTheme, toggleTheme } from '@/lib/theme';

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
    vi.unstubAllGlobals();
    setTheme('light');
    localStorage.clear();
  });

  it('defaults to light without a stored choice or dark OS preference', () => {
    expect(resolveInitialTheme()).toBe('light');
  });

  it('follows the OS preference when nothing is stored', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
    }));

    expect(resolveInitialTheme()).toBe('dark');
  });

  it('prefers a stored choice over the OS preference', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
    }));
    localStorage.setItem('eduassist.theme', 'light');

    expect(resolveInitialTheme()).toBe('light');
  });

  it('applies, persists and toggles the theme', () => {
    setTheme('dark');

    expect(getTheme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem('eduassist.theme')).toBe('dark');

    toggleTheme();

    expect(getTheme()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(localStorage.getItem('eduassist.theme')).toBe('light');
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem('eduassist.theme', 'sepia');

    expect(resolveInitialTheme()).toBe('light');
  });
});
