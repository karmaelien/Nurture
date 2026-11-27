/* Medication notifications run independently of an open website tab. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('push', (event) => {
  let payload
  try {
    payload = event.data?.json()
  } catch {
    return
  }
  if (!payload) return
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Medication reminder', {
      body: 'Open Nurture to review your medications.',
      tag: payload.tag,
      data: { url: payload.url },
    }),
  )
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const url = new URL(event.notification.data?.url || '/app/medications', self.location.origin)
      if (url.origin !== self.location.origin || url.pathname !== '/app/medications') return
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((client) => new URL(client.url).origin === url.origin)
      if (existing) {
        await existing.navigate(url.href)
        await existing.focus()
      } else await self.clients.openWindow(url.href)
    })(),
  )
})
