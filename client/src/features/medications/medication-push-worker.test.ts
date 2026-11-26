/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

it('receives pushes without a page and opens the medication page on notification click', async () => {
  const listeners: Record<string, (event: any) => void> = {}
  const showNotification = vi.fn().mockResolvedValue(undefined)
  const openWindow = vi.fn().mockResolvedValue(undefined)
  const self = {
    addEventListener: (name: string, listener: (event: any) => void) => {
      listeners[name] = listener
    },
    skipWaiting: vi.fn(),
    registration: { showNotification },
    location: { origin: 'https://nurture.example' },
    clients: { matchAll: vi.fn().mockResolvedValue([]), openWindow },
  }
  runInNewContext(readFileSync('public/medication-push-sw.js', 'utf8'), { self, URL })
  let work: Promise<unknown> = Promise.resolve()
  listeners.push({
    data: {
      json: () => ({
        title: 'Medication reminder',
        body: 'Sensitive dose details',
        tag: 'dose',
        url: '/app/medications?circleId=1',
      }),
    },
    waitUntil: (promise: Promise<unknown>) => {
      work = promise
    },
  })
  await work
  expect(showNotification).toHaveBeenCalledWith(
    'Medication reminder',
    expect.objectContaining({ body: 'Open Nurture to review your medications.', tag: 'dose' }),
  )
  listeners.notificationclick({
    notification: { close: vi.fn(), data: { url: '/app/medications?circleId=1' } },
    waitUntil: (promise: Promise<unknown>) => {
      work = promise
    },
  })
  await work
  expect(openWindow).toHaveBeenCalledWith('https://nurture.example/app/medications?circleId=1')
  openWindow.mockClear()
  listeners.notificationclick({
    notification: { close: vi.fn(), data: { url: 'https://other.example/steal' } },
    waitUntil: (promise: Promise<unknown>) => {
      work = promise
    },
  })
  await work
  expect(openWindow).not.toHaveBeenCalled()
})
