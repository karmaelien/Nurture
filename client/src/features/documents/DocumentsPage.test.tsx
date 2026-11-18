import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'

beforeEach(async () => {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:test')
      static revokeObjectURL = vi.fn()
    },
  )
})
afterEach(() => vi.unstubAllGlobals())
it('shows layout C, filters documents, edits sharing and deletes a document', async () => {
  const user = userEvent.setup()
  renderApp('/app/documents?circleId=c_demo')
  await screen.findByRole('heading', { name: 'Care documents' })
  await screen.findByRole('button', { name: /November visit summary/ })
  expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Expenses' })).toHaveAttribute('href', '/app/expenses?circleId=c_demo')
  expect(screen.getByLabelText('Care circle')).toBeDisabled()
  await user.selectOptions(screen.getByLabelText('Filter by category'), 'financial')
  expect(screen.queryByRole('button', { name: /November visit summary/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Edit details & sharing' }))
  await user.selectOptions(screen.getByLabelText('Who can access'), 'circle')
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('Document updated.')
  expect(
    within(screen.getByRole('complementary', { name: 'Document details' })).getByText('Everyone in this circle'),
  ).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Delete document' }))
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
  await screen.findByText('Document deleted.')
  expect(screen.getByRole('heading', { name: 'No documents found' })).toBeInTheDocument()
})
it('opens an upload form and validates missing file selection', async () => {
  const user = userEvent.setup()
  renderApp('/app/documents')
  await waitFor(() => expect(screen.getByRole('button', { name: '+ Upload document' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: '+ Upload document' }))
  await user.type(screen.getByLabelText('Document title'), 'Test upload')
  await user.click(screen.getByRole('button', { name: 'Upload document' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a file to upload.')
  expect(screen.getByLabelText('Who can access')).toHaveValue('selected')
})
