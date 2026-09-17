import { themePreference, type ThemePreference } from './storage';

export type ResolvedTheme = 'light' | 'dark';

const darkMediaQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? (darkMediaQuery().matches ? 'dark' : 'light') : pref;
}

let cachedTheme: ResolvedTheme = 'light';

function paint(theme: ResolvedTheme) {
  cachedTheme = theme;
  document.documentElement.dataset.theme = theme;
}

// Synchronous read of the last-painted theme, for choosing which icon to
// show without making every render function async.
export function getCachedTheme(): ResolvedTheme {
  return cachedTheme;
}

let activeOnChange: (() => void) | undefined;
let listenersRegistered = false;

// Paints the theme immediately, then keeps it in sync with OS-level changes
// (while the preference is "system") and with toggles made from other
// extension pages — popup/dashboard/onboarding each run in their own
// document. `onChange` re-renders so an already-open page's toggle icon
// stays current when the theme changes out from under it.
//
// Safe to call more than once per document (e.g. re-running init() after a
// reconnect) — only the first call registers the change listeners.
export async function initTheme(onChange?: () => void): Promise<void> {
  activeOnChange = onChange;
  paint(resolveTheme(await themePreference.getValue()));

  if (listenersRegistered) return;
  listenersRegistered = true;

  darkMediaQuery().addEventListener('change', async () => {
    const pref = await themePreference.getValue();
    if (pref !== 'system') return;
    paint(resolveTheme(pref));
    activeOnChange?.();
  });

  themePreference.watch((pref) => {
    paint(resolveTheme(pref));
    activeOnChange?.();
  });
}

// Flips between light and dark, overriding whatever the OS preference is.
export async function toggleTheme(): Promise<void> {
  const next: ThemePreference = getCachedTheme() === 'dark' ? 'light' : 'dark';
  await themePreference.setValue(next);
}
