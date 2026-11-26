import { resetMockDocuments } from '../mocks/documentHandlers.ts'
import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { handlers } from '../mocks/handlers.ts'

export const server = setupServer(...handlers)

// Integration tests render whole pages, including lazily loaded routes. With every worker busy, a
// step can take longer than the 1 second findBy/waitFor default, so allow more before failing.
configure({ asyncUtilTimeout: 5000 })

// jsdom does not implement these native browser dialog methods.
const dialogMethods = ['showModal', 'close'] as const
const originalDialogMethods = dialogMethods.map((method) =>
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, method),
)

beforeAll(() => {
  // Model the origin-wide browser lock queue used by the mock database.
  const locks = new Map<string, Promise<unknown>>()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (name: string, action: () => unknown) => {
        const next = (locks.get(name) ?? Promise.resolve()).catch(() => {}).then(action)
        locks.set(
          name,
          next.catch(() => {}),
        )
        return next
      },
    },
  })
  server.listen({ onUnhandledRequest: 'error' })
  // React Router restores document scroll; jsdom does not implement this browser method.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '')
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open')
        this.dispatchEvent(new Event('close'))
      },
    },
  })
})
afterEach(() => {
  cleanup()
  resetMockDocuments()
  server.resetHandlers()
  localStorage.clear()
})
afterAll(() => {
  server.close()
  vi.restoreAllMocks()
  dialogMethods.forEach((method, index) => {
    const original = originalDialogMethods[index]
    if (original) Object.defineProperty(HTMLDialogElement.prototype, method, original)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, method)
  })
})
