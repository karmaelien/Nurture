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

it('shows failed processing, preserves preview access, and retries without re-uploading', async () => {
  const { documentsApi } = await import('../../api/documents.ts')
  const { server } = await import('../../test/setup.ts')
  const { http, HttpResponse } = await import('msw')
  const initial = await documentsApi.list('c_demo')
  let ready = false
  let retries = 0
  server.use(
    http.get('/api/circles/c_demo/documents', () =>
      HttpResponse.json({
        documents: initial.documents.map((d) => ({
          ...d,
          processingStatus: ready ? 'ready' : 'failed',
          processingError: ready ? null : 'embedding_unavailable',
        })),
      }),
    ),
    http.post('/api/circles/c_demo/documents/:id/process', ({ params }) => {
      retries++
      ready = true
      return HttpResponse.json({
        document: {
          ...initial.documents.find((d) => d.id === params.id),
          processingStatus: 'ready',
          processingError: null,
        },
      })
    }),
  )
  renderApp('/app/documents?circleId=c_demo')
  const user = userEvent.setup()
  await screen.findByText('The search service was unavailable. You can retry processing.')
  expect(await screen.findByRole('link', { name: 'Download original' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Retry processing' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry processing' })).not.toBeInTheDocument())
  expect(retries).toBe(1)
  expect(screen.getByRole('complementary', { name: 'Document details' })).toHaveTextContent('Ready for search')
})

it('accepts PDF uploads only and displays processing progress during the request', async () => {
  const { documentsApi } = await import('../../api/documents.ts')
  const { server } = await import('../../test/setup.ts')
  const { http, HttpResponse, delay } = await import('msw')
  const initial = (await documentsApi.list('c_demo')).documents[0]
  server.use(
    http.post('/api/circles/c_demo/documents', async () => {
      await delay(100)
      return HttpResponse.json(
        { document: { ...initial, processingStatus: 'ready', processingError: null } },
        { status: 201 },
      )
    }),
  )
  renderApp('/app/documents?circleId=c_demo')
  const user = userEvent.setup()
  await waitFor(() => expect(screen.getByRole('button', { name: '+ Upload document' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: '+ Upload document' }))
  expect(screen.getByLabelText('File')).toHaveAttribute('accept', 'application/pdf,.pdf')
  await user.upload(screen.getByLabelText('File'), new File(['%PDF-test'], 'report.pdf', { type: 'application/pdf' }))
  await user.click(screen.getByRole('button', { name: 'Upload document' }))
  expect(screen.getByRole('button', { name: 'Uploading and processing…' })).toBeDisabled()
  await screen.findByText('Document uploaded and ready for search.')
})
