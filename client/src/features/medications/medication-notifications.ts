import { request } from '../../api/client.ts'

const scope = '/medication-notifications/'
export const notificationConfig = () =>
  request<{ enabled: boolean; publicKey: string | null }>('/api/medication-notifications/config')

async function subscription() {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration(scope)
  return (await registration?.pushManager.getSubscription()) ?? null
}

export async function notificationsEnabled() {
  const current = await subscription()
  if (!current) return false
  return (
    await request<{ enabled: boolean }>('/api/medication-notifications/subscription/status', {
      method: 'POST',
      body: { endpoint: current.endpoint },
    })
  ).enabled
}

export async function enableMedicationNotifications(publicKey: string) {
  if ((await Notification.requestPermission()) !== 'granted')
    throw new Error('Allow notifications in your browser settings to enable reminders.')
  // This dedicated scope does not replace the demo worker or control app requests.
  const registration = await navigator.serviceWorker.register('/medication-push-sw.js', { scope })
  if (!registration.active)
    await new Promise<void>((resolve, reject) => {
      const worker = registration.installing ?? registration.waiting
      if (!worker) {
        reject(new Error('The notification service could not start.'))
        return
      }
      const changed = () => {
        if (worker.state === 'activated') {
          worker.removeEventListener('statechange', changed)
          resolve()
        } else if (worker.state === 'redundant') {
          worker.removeEventListener('statechange', changed)
          reject(new Error('The notification service could not start.'))
        }
      }
      worker.addEventListener('statechange', changed)
      changed()
    })
  const decoded = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/'))
  const key = Uint8Array.from(decoded, (character) => character.charCodeAt(0))
  let current = await registration.pushManager.getSubscription()
  const previousKey = current?.options?.applicationServerKey
  if (
    current &&
    (!previousKey ||
      new Uint8Array(previousKey).length !== key.length ||
      new Uint8Array(previousKey).some((byte, index) => byte !== key[index]))
  ) {
    if (!(await current.unsubscribe()))
      throw new Error('The notification subscription could not be updated. Try again.')
    current = null
  }
  const next =
    current ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }))
  try {
    await request('/api/medication-notifications/subscription', { method: 'POST', body: next.toJSON() })
  } catch (error) {
    if (!current) await next.unsubscribe().catch(() => {})
    throw error
  }
}

/** Unsubscribe locally first, so logout stops delivery even when the API cannot be reached. */
export async function disableMedicationNotifications() {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration(scope)
  for (const notification of (await registration?.getNotifications()) ?? []) notification.close()
  const current = await registration?.pushManager.getSubscription()
  if (!current) return
  if (!(await current.unsubscribe())) throw new Error('Notifications could not be disabled. Try again.')
  await request('/api/medication-notifications/subscription', {
    method: 'DELETE',
    body: { endpoint: current.endpoint },
  })
}
