import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderApp } from '../test/renderApp.tsx'
import { readThemePreference, setThemePreference, THEME_KEY } from './theme.ts'

const theme = () => document.documentElement.dataset.theme

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('theme preference', () => {
  it('follows the system until the viewer picks a theme, and remembers the pick', () => {
    expect(readThemePreference()).toBe('system')
    expect(theme()).toBeUndefined()

    setThemePreference('dark')
    expect(theme()).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')

    setThemePreference('system')
    expect(theme()).toBeUndefined()
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('ignores an unknown saved value', () => {
    localStorage.setItem(THEME_KEY, 'sepia')
    expect(readThemePreference()).toBe('system')
  })

  it('switches from the login page and picks up changes from other tabs', async () => {
    const user = userEvent.setup()
    renderApp('/login')

    const group = await screen.findByRole('group', { name: 'Theme' })
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Light' }))
    expect(theme()).toBe('light')
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked()

    // Another tab saves "dark".
    localStorage.setItem(THEME_KEY, 'dark')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY }))
    })
    expect(theme()).toBe('dark')
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(group).toBeInTheDocument()
  })
})
