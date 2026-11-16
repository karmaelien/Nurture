import { screen, within, waitFor } from '@testing-library/react'
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
  await user.click(await screen.findByRole('button', { name: '+ Add expense' }))
  await user.type(screen.getByLabelText('Description'), 'Pharmacy pickup')
  await user.type(screen.getByLabelText('Amount (USD)'), '12.50')
  await user.selectOptions(screen.getByLabelText('Category'), 'medication')
  await user.click(screen.getByRole('button', { name: 'Save expense' }))
  await screen.findByText('Expense saved. The list shows expenses matching your filters.')
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
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
  await screen.findByText('Expense deleted.')
  expect(screen.queryByText('Pharmacy pickup')).not.toBeInTheDocument()
})
