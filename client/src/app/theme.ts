import { useSyncExternalStore } from 'react'

// The viewer's light/dark choice. "system" follows the operating system through
// prefers-color-scheme; "light" and "dark" set data-theme on <html>, which theme.css reads.
// index.html applies the saved choice before the app loads, so pages never flash the wrong theme.

export type ThemePreference = 'system' | 'light' | 'dark'

// Keep in sync with the inline script in index.html.
export const THEME_KEY = 'nurture.theme'

const listeners = new Set<() => void>()

export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    // Storage can throw in private windows or when site data is blocked.
    return 'system'
  }
}

export function applyThemePreference(preference: ThemePreference) {
  const root = document.documentElement
  if (preference === 'system') delete root.dataset.theme
  else root.dataset.theme = preference
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, preference)
  } catch {
    // The choice still applies until the page closes.
  }
  applyThemePreference(preference)
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  // Another tab changed the theme: apply it here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return
    applyThemePreference(readThemePreference())
    listener()
  }
  listeners.add(listener)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useThemePreference() {
  return useSyncExternalStore(subscribe, readThemePreference, () => 'system' as const)
}
