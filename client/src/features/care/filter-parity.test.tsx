import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'

it.each([
  ['/app', 'Add task'],
  ['/app/tasks', 'Add task'],
  ['/app/appointments', 'Add appointment'],
  ['/app/medications', 'Add medication'],
  ['/app/medications/assistance', 'Report cost or coverage'],
  ['/app/expenses', 'Add expense'],
  ['/app/documents', 'Upload document'],
])('discards open editors on a family switch without losing saved person filters on %s', async (path, actionName) => {
  const db = readDb()
  db.circles.push({
    ...db.circles[0],
    id: 'c_second',
    name: 'Second family',
    recipients: [{ ...db.circles[0].recipients[0], id: 'r_second' }],
  })
  writeDb(db)
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const user = userEvent.setup()
  const router = renderApp(path)
  await user.selectOptions(await screen.findByLabelText('Care profile'), 'r_frank')
  const add = screen.getByRole('button', { name: actionName })
  await waitFor(() => expect(add).toBeEnabled())
  await user.click(add)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await act(() => router.navigate(`${path}?circleId=c_second`))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(await screen.findByLabelText('Care profile')).toHaveValue('')
  await act(() => router.navigate(`${path}?circleId=c_demo`))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(await screen.findByLabelText('Care profile')).toHaveValue('r_frank')
})

it.each([
  ['/app/tasks', 'Task list', 'Grocery delivery', 'Pick up prescription'],
  ['/app/appointments', 'Upcoming appointments', 'Physical therapy', 'Annual checkup'],
  ['/app/medications', 'Medication List', 'Sample medication B', 'Sample medication A'],
  ['/app/expenses', 'Recorded expenses', 'Clinic copay', 'Pharmacy pickup'],
])('filters the actual collection on %s and restores everyone when cleared', async (path, region, frank, rose) => {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const user = userEvent.setup()
  renderApp(path)
  const filter = await screen.findByRole('combobox', { name: 'Care profile' })
  const list = await screen.findByRole('region', { name: region })
  await within(list).findByText(rose)
  await user.selectOptions(filter, 'r_frank')
  await waitFor(() => {
    const current = screen.getByRole('region', { name: region })
    expect(within(current).getByText(frank)).toBeInTheDocument()
    expect(within(current).queryByText(rose)).not.toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(filter).toHaveValue('')
  await waitFor(() => expect(within(screen.getByRole('region', { name: region })).getByText(rose)).toBeInTheDocument())
})

it('filters the document records and clears person, category, and search together', async () => {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const user = userEvent.setup()
  renderApp('/app/documents')
  await screen.findByRole('button', { name: /November visit summary/ })
  await user.selectOptions(screen.getByLabelText('Care profile'), 'r_frank')
  expect(screen.queryByRole('button', { name: /November visit summary/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Physical therapy invoice/ })).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Filter by category'), 'financial')
  await user.type(screen.getByLabelText('Search documents'), 'invoice')
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByLabelText('Search documents')).toHaveValue('')
  expect(screen.getByLabelText('Filter by category')).toHaveValue('all')
  expect(screen.getByRole('button', { name: /November visit summary/ })).toBeInTheDocument()
})

it('applies the Home person filter to tasks, appointments, and medication records together', async () => {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const user = userEvent.setup()
  renderApp('/app')
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Care profile' }), 'r_frank')
  for (const [region, frank, rose] of [
    ['Tasks', 'Grocery delivery', 'Pick up prescription'],
    ['Appointments', 'Physical therapy', 'Annual checkup'],
    ['Medication List', 'Sample medication B', 'Sample medication A'],
  ]) {
    const list = await screen.findByRole('region', { name: region })
    await within(list).findByText(frank)
    expect(within(list).queryByText(rose)).not.toBeInTheDocument()
  }
})

it('keeps the same person across every feature and Home, and clears the shared selection', async () => {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const user = userEvent.setup()
  const router = renderApp('/app/tasks')
  await user.selectOptions(await screen.findByLabelText('Care profile'), 'r_frank')
  for (const path of [
    '/app/appointments',
    '/app/medications',
    '/app/medications/assistance',
    '/app/expenses',
    '/app/documents',
    '/app',
  ]) {
    await act(() => router.navigate(path))
    const filter = await screen.findByRole('combobox', { name: 'Care profile' })
    expect(filter).toHaveValue('r_frank')
    expect(within(filter).getByRole('option', { name: 'Everyone' })).toHaveValue('')
  }
  await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])
  expect(screen.getByRole('combobox', { name: 'Care profile' })).toHaveValue('')
  await act(() => router.navigate('/app/tasks'))
  expect(await screen.findByRole('combobox', { name: 'Care profile' })).toHaveValue('')
})

it('preserves task filters after saving and reveals a hidden saved task when filters are cleared', async () => {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const user = userEvent.setup()
  renderApp('/app/tasks')
  await user.selectOptions(await screen.findByLabelText('Care profile'), 'r_frank')
  const add = screen.getByRole('button', { name: 'Add task' })
  await waitFor(() => expect(add).toBeEnabled())
  await user.click(add)
  const form = within(screen.getByRole('dialog', { name: 'Add task' }))
  await user.type(form.getByLabelText('Task title'), 'Rose filter preservation')
  await user.selectOptions(form.getByLabelText('Care profile'), 'r_rose')
  await user.click(form.getByRole('button', { name: 'Save task' }))
  await screen.findByText('Task saved. Clear filters if it is not shown.')
  expect(screen.getByRole('combobox', { name: 'Care profile' })).toHaveValue('r_frank')
  const list = screen.getByRole('region', { name: 'Task list' })
  expect(within(list).queryByText('Rose filter preservation')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(await within(list).findByText('Rose filter preservation')).toBeInTheDocument()
})

it('keeps appointment filters available during a read error and retries inside the workspace', async () => {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  server.use(
    http.get('/api/circles/:circleId/appointments', () =>
      HttpResponse.json({ error: { code: 'unavailable', message: 'Appointments unavailable.' } }, { status: 502 }),
    ),
  )
  const user = userEvent.setup()
  renderApp('/app/appointments')
  await screen.findByText('Appointments unavailable.')
  expect(screen.getByRole('combobox', { name: 'Care profile' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Clear filters' })).toBeEnabled()
  server.resetHandlers()
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('region', { name: 'Upcoming appointments' })).toBeInTheDocument()
})
