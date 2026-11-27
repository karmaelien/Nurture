import { afterEach, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup.ts'
import {
  disableMedicationNotifications,
  enableMedicationNotifications,
  notificationsEnabled,
} from './medication-notifications.ts'

afterEach(() => vi.unstubAllGlobals())
function browser(permission = 'granted') {
  const current = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      expirationTime: null,
      keys: { p256dh: 'public', auth: 'auth' },
    }),
  }
  const registration = {
    getNotifications: vi.fn().mockResolvedValue([]),
    active: {},
    pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn().mockResolvedValue(current) },
  }
  const register = vi.fn().mockResolvedValue(registration)
  vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue(permission) })
  vi.stubGlobal('navigator', { serviceWorker: { register, getRegistration: vi.fn().mockResolvedValue(registration) } })
  return { current, registration, register }
}

it('requests permission only when enabling and persists the browser subscription', async () => {
  const { register, registration } = browser()
  let saved: unknown
  server.use(
    http.post('/api/medication-notifications/subscription', async ({ request }) => {
      saved = await request.json()
      return new HttpResponse(null, { status: 204 })
    }),
  )
  await enableMedicationNotifications(btoa('test-key'))
  expect(Notification.requestPermission).toHaveBeenCalledOnce()
  expect(register).toHaveBeenCalledWith('/medication-push-sw.js', { scope: '/medication-notifications/' })
  expect(registration.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }))
  expect(saved).toMatchObject({ endpoint: 'https://fcm.googleapis.com/fcm/send/test' })
})

it('does not subscribe when permission is denied and cleans up an unsaved new subscription', async () => {
  const denied = browser('denied')
  await expect(enableMedicationNotifications(btoa('test-key'))).rejects.toThrow('Allow notifications')
  expect(denied.register).not.toHaveBeenCalled()
  const allowed = browser()
  server.use(http.post('/api/medication-notifications/subscription', () => new HttpResponse(null, { status: 503 })))
  await expect(enableMedicationNotifications(btoa('test-key'))).rejects.toMatchObject({ status: 503 })
  expect(allowed.current.unsubscribe).toHaveBeenCalledOnce()
})

it('checks ownership after refresh and unsubscribes locally even when server removal fails', async () => {
  const { current, registration } = browser()
  registration.pushManager.getSubscription.mockResolvedValue(current)
  const close = vi.fn()
  registration.getNotifications.mockResolvedValue([{ close }])
  server.use(
    http.post('/api/medication-notifications/subscription/status', () => HttpResponse.json({ enabled: true })),
    http.delete('/api/medication-notifications/subscription', () => new HttpResponse(null, { status: 502 })),
  )
  expect(await notificationsEnabled()).toBe(true)
  await expect(disableMedicationNotifications()).rejects.toMatchObject({ status: 502 })
  expect(current.unsubscribe).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
})
