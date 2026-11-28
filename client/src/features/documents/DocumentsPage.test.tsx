import { fireEvent, screen, within, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup.ts'
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
  await waitFor(() => expect(screen.getByRole('button', { name: 'Upload document' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Upload document' }))
  await user.type(screen.getByLabelText('Document title'), 'Test upload')
  await user.click(
    within(screen.getByRole('dialog', { name: 'Upload a document' })).getByRole('button', { name: 'Upload document' }),
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a file to upload.')
  expect(screen.getByLabelText('Who can access')).toHaveValue('selected')
})

it('shows a conflict without replacing a stale form or restoring access', async () => {
  const { documentsApi } = await import('../../api/documents.ts')
  const user = userEvent.setup()
  renderApp('/app/documents?circleId=c_demo')
  await screen.findByRole('button', { name: /November visit summary/ })
  await user.click(screen.getByRole('button', { name: 'Edit details & sharing' }))
  const original = (await documentsApi.list('c_demo')).documents.find((d) => d.id === 'doc_demo_0')!
  await documentsApi.update('c_demo', original.id, {
    version: original.version,
    sharing: { mode: 'selected', memberIds: [] },
  })
  await user.clear(screen.getByLabelText('Document title'))
  await user.type(screen.getByLabelText('Document title'), 'My unsaved edit')
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('This document changed.')
  expect(screen.getByLabelText('Document title')).toHaveValue('My unsaved edit')
  const saved = (await documentsApi.list('c_demo')).documents.find((d) => d.id === original.id)!
  expect(saved.title).toBe(original.title)
  expect(saved.sharing.memberIds).toEqual([])
})

it('closes upload/edit popups on click-away without changing documents', async () => {
  const user = userEvent.setup()
  renderApp('/app/documents')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Upload document' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Upload document' }))
  fireEvent.click(screen.getByRole('dialog', { name: 'Upload a document' }), { clientX: -10, clientY: -10 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Edit details & sharing' }))
  const edit = screen.getByRole('dialog', { name: 'Edit document' })
  await user.clear(within(edit).getByLabelText('Document title'))
  await user.type(within(edit).getByLabelText('Document title'), 'Unsaved title')
  fireEvent.click(edit, { clientX: -10, clientY: -10 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByText('Unsaved title')).not.toBeInTheDocument()
})

it('keeps document upload open while saving and shows a failed upload inside the popup', async () => {
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.post('/api/circles/:circleId/documents', async () => {
      await waiting
      return HttpResponse.json({ error: { code: 'unavailable', message: 'Upload unavailable.' } }, { status: 503 })
    }),
  )
  const user = userEvent.setup()
  renderApp('/app/documents')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Upload document' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Upload document' }))
  const dialog = screen.getByRole('dialog', { name: 'Upload a document' })
  await user.type(within(dialog).getByLabelText('Document title'), 'Upload test')
  await user.upload(
    within(dialog).getByLabelText('File'),
    new File(['%PDF sample'], 'sample.pdf', { type: 'application/pdf' }),
  )
  try {
    await user.click(within(dialog).getByRole('button', { name: 'Upload document' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled())
    fireEvent.click(dialog, { clientX: -10, clientY: -10 })
    expect(fireEvent(dialog, new Event('cancel', { cancelable: true }))).toBe(false)
    expect(dialog).toBeInTheDocument()
    release()
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Upload unavailable.')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close' })).toBeEnabled())
  } finally {
    release()
  }
})
