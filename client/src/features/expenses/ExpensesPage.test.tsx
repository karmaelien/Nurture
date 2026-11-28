import { fireEvent, screen, within, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup.ts'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'

beforeEach(async () => {
  const { token } = await authApi.login(DEMO_ACCOUNT)
  setToken(token)
  const db = readDb()
  db.care.expenses = []
  writeDb(db)
})

it('adds, filters, edits, and deletes expenses while updating the summary', async () => {
  const user = userEvent.setup()
  renderApp('/app/expenses')
  await user.click(await screen.findByRole('button', { name: 'Add expense' }))
  await user.type(screen.getByLabelText('Description'), 'Pharmacy pickup')
  await user.type(screen.getByLabelText('Amount (USD)'), '12.50')
  await user.selectOptions(screen.getByLabelText('Category'), 'medication')
  await user.click(screen.getByRole('button', { name: 'Save expense' }))
  await screen.findByText('Expense saved. Clear filters if it is not shown.')
  const summary = screen.getByRole('region', { name: 'Spending summary' })
  expect(within(summary).getByText('1 recorded expenses · USD')).toBeInTheDocument()
  expect(within(summary).getAllByText('$12.50')).toHaveLength(2)
  await user.selectOptions(screen.getByLabelText('Filter by category'), 'insurance')
  await screen.findByText('No expenses match these filters. Add an expense or change your filters.')
  await user.selectOptions(screen.getByLabelText('Filter by category'), '')
  await user.click(await screen.findByRole('button', { name: 'Edit Pharmacy pickup' }))
  await user.clear(screen.getByLabelText('Amount (USD)'))
  await user.type(screen.getByLabelText('Amount (USD)'), '20.00')
  await user.click(screen.getByRole('button', { name: 'Save expense' }))
  await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit expense' })).not.toBeInTheDocument())
  expect(within(screen.getByRole('region', { name: 'Spending summary' })).getAllByText('$20.00')).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: 'Delete Pharmacy pickup' }))
  expect(screen.getByText('Delete “Pharmacy pickup”? This cannot be undone.')).toBeInTheDocument()
  await user.click(
    within(screen.getByRole('dialog', { name: 'Delete expense?' })).getByRole('button', { name: 'Delete expense' }),
  )
  await screen.findByText('Expense deleted.')
  expect(screen.queryByText('Pharmacy pickup')).not.toBeInTheDocument()
})

it('dismisses an expense popup by clicking away, but blocks closing during a save and keeps errors inside', async () => {
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post('/api/circles/:circleId/expenses', async () => {
      await waiting
      return HttpResponse.json({ error: { code: 'unavailable', message: 'Save unavailable.' } }, { status: 503 })
    }),
  )
  const user = userEvent.setup()
  renderApp('/app/expenses')
  await user.click(await screen.findByRole('button', { name: 'Add expense' }))
  let dialog = screen.getByRole('dialog', { name: 'Add expense' })
  fireEvent.click(dialog, { clientX: -10, clientY: -10 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Add expense' }))
  dialog = screen.getByRole('dialog', { name: 'Add expense' })
  await user.type(within(dialog).getByLabelText('Description'), 'Popup test')
  await user.type(within(dialog).getByLabelText('Amount (USD)'), '5.00')
  try {
    await user.click(within(dialog).getByRole('button', { name: 'Save expense' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled())
    fireEvent.click(dialog, { clientX: -10, clientY: -10 })
    expect(fireEvent(dialog, new Event('cancel', { cancelable: true }))).toBe(false)
    expect(dialog).toBeInTheDocument()
    release()
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Save unavailable.')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close' })).toBeEnabled())
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  } finally {
    release()
  }
})
