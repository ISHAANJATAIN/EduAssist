import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTheme, resolveInitialTheme, setTheme, toggleTheme } from '@/lib/theme';
import indexHtml from '../../index.html?raw';

function runThemeBootstrap() {
  const page = new DOMParser().parseFromString(indexHtml, 'text/html');
  const script = page.querySelector('script:not([type])')!.textContent!;
  new Function(script)();
}

function blockStorageWithDarkSystem() {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('Storage blocked', 'SecurityError');
  });
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
    vi.unstubAllGlobals();
    setTheme('light');
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('boots into dark OS mode when storage access throws and stays consistent on import and toggle', async () => {
    blockStorageWithDarkSystem();

    runThemeBootstrap();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');

    vi.resetModules();
    const controller = await import('@/lib/theme');
    expect(controller.getTheme()).toBe('dark');
    controller.toggleTheme();
    expect(controller.getTheme()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
    controller.toggleTheme();
    expect(controller.getTheme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('applies the resolved initial theme on a fresh import even without bootstrap', async () => {
    blockStorageWithDarkSystem();
    vi.resetModules();

    const controller = await import('@/lib/theme');

    expect(controller.getTheme()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    controller.toggleTheme();
    expect(controller.getTheme()).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('bootstrap respects a stored light choice over a dark OS preference', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }));
    localStorage.setItem('eduassist.theme', 'light');

    runThemeBootstrap();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
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
