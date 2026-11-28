import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'

it.each([
  ['documents', 'Delete document'],
  ['expenses', 'Delete Pharmacy pickup'],
])(
  'blocks duplicate deletion and dismissal while %s deletion is pending, then keeps the error in the dialog',
  async (resource, entryAction) => {
    setToken((await authApi.login(DEMO_ACCOUNT)).token)
    let release!: () => void
    let requests = 0
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.delete(`/api/circles/:circleId/${resource}/:id`, async () => {
        requests++
        await waiting
        return HttpResponse.json({ error: { code: 'unavailable', message: 'Deletion unavailable.' } }, { status: 503 })
      }),
    )
    const user = userEvent.setup()
    renderApp(`/app/${resource}`)
    await user.click(await screen.findByRole('button', { name: entryAction }))
    const noun = resource === 'documents' ? 'document' : 'expense'
    const dialog = screen.getByRole('dialog', { name: `Delete ${noun}?` })
    const confirm = within(dialog).getByRole('button', { name: `Delete ${noun}` })
    try {
      act(() => {
        fireEvent.click(confirm)
        fireEvent.click(confirm)
        fireEvent.click(dialog, { clientX: -10, clientY: -10 })
      })
      await waitFor(() => expect(requests).toBe(1))
      expect(dialog).toHaveAttribute('open')
      expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
      expect(fireEvent(dialog, new Event('cancel', { cancelable: true }))).toBe(false)
      release()
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Deletion unavailable.')
      await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close' })).toBeEnabled())
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: entryAction })).toBeInTheDocument()
    } finally {
      release()
    }
  },
)
