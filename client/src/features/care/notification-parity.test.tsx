import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'

const state = vi.hoisted(() => ({ subscribed: false, fail: false }))
vi.mock('../../mocks/enabled.ts', () => ({ mocksEnabled: false }))
vi.mock('../medications/medication-notifications.ts', () => ({
  notificationConfig: async () => ({ enabled: true, publicKey: 'test-key' }),
  notificationsEnabled: async () => state.subscribed,
  enableMedicationNotifications: async () => {
    if (state.fail) throw new Error('Notifications unavailable.')
    state.subscribed = true
  },
  disableMedicationNotifications: async () => {
    state.subscribed = false
  },
}))

const originalWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
beforeEach(() => {
  state.subscribed = false
  state.fail = false
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('Notification', class {})
  vi.stubGlobal('PushManager', class {})
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} })
})
afterEach(() => {
  vi.unstubAllGlobals()
  if (originalWorker) Object.defineProperty(navigator, 'serviceWorker', originalWorker)
  else Reflect.deleteProperty(navigator, 'serviceWorker')
})

it.each(['/app', '/app/medications'])(
  'shares notification state, action styling, and failure feedback starting on %s',
  async (path) => {
    setToken((await authApi.login(DEMO_ACCOUNT)).token)
    const user = userEvent.setup()
    const router = renderApp(path)
    const enable = await screen.findByRole('button', { name: 'Enable notifications' })
    const styling = enable.className
    await user.click(enable)
    await screen.findByRole('button', { name: 'Disable notifications' })
    await act(() => router.navigate(path === '/app' ? '/app/medications' : '/app'))
    const disable = await screen.findByRole('button', { name: 'Disable notifications' })
    expect(disable.className).toBe(styling)
    await user.click(disable)
    const nextEnable = await screen.findByRole('button', { name: 'Enable notifications' })
    state.fail = true
    await user.click(nextEnable)
    expect(await screen.findByText('Notifications unavailable.')).toBeInTheDocument()
    expect(state.subscribed).toBe(false)
    expect(screen.getByRole('button', { name: 'Enable notifications' })).toBeEnabled()
  },
)

it.each(['/app', '/app/medications'])('hides unsupported notification controls on %s', async (path) => {
  vi.stubGlobal('isSecureContext', false)
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  renderApp(path)
  await screen.findByRole('region', { name: 'Medication List' })
  expect(screen.queryByRole('button', { name: /notifications$/ })).not.toBeInTheDocument()
})
