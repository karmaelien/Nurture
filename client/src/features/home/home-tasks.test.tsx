import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'

async function login() {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
}

it('creates an undated task from Home, supports completion, and retains it after reload', async () => {
  await login()
  const db = readDb()
  db.care.tasks = []
  writeDb(db)
  const user = userEvent.setup()
  renderApp('/app')
  const panel = await screen.findByRole('region', { name: 'Tasks' })
  const add = within(panel).getByRole('button', { name: 'Add task' })
  await waitFor(() => expect(add).toBeEnabled())
  await user.selectOptions(screen.getByLabelText('Care profile'), 'r_frank')
  await user.click(add)
  let dialog = screen.getByRole('dialog', { name: 'Add task' })
  expect(within(dialog).getByLabelText('Care profile')).toHaveValue('r_frank')
  fireEvent.click(dialog, { clientX: -10, clientY: -10 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(add)
  dialog = screen.getByRole('dialog', { name: 'Add task' })
  await user.type(within(dialog).getByLabelText('Task title'), 'Call the pharmacy')
  await user.click(within(dialog).getByRole('button', { name: 'Save task' }))
  expect(await within(panel).findByText('Call the pharmacy')).toBeInTheDocument()
  expect(within(panel).getByText('No due date')).toBeInTheDocument()
  expect(readDb().care.tasks).toHaveLength(1)
  expect(readDb().care.tasks[0]).toMatchObject({ recipientId: 'r_frank', dueAt: null })
  await user.click(within(panel).getByRole('button', { name: 'Mark Completed: Call the pharmacy' }))
  await waitFor(() => expect(within(panel).getByText('Completed')).toBeInTheDocument())
  cleanup()
  renderApp('/app')
  const reloaded = await screen.findByRole('region', { name: 'Tasks' })
  expect(await within(reloaded).findByText('Call the pharmacy')).toBeInTheDocument()
  expect(within(reloaded).getByRole('button', { name: 'Mark To Do: Call the pharmacy' })).toBeInTheDocument()
})

it('includes undated tasks without bypassing profile, status, completion, or dated-window filters', async () => {
  await login()
  const input = { title: 'Undated Rose task', recipientId: 'r_rose', dueAt: null, assignedCaregiverId: null }
  await careApi.createTask('c_demo', input)
  await careApi.createTask('c_demo', { ...input, title: 'Undated Frank task', recipientId: 'r_frank' })
  await careApi.createTask('c_demo', { ...input, title: 'Far future task', dueAt: '2099-01-01T12:00:00Z' })
  const filters = { dueBefore: '2090-01-01T00:00:00Z', recipientId: 'r_rose', status: 'pending' as const }
  const ordinary = (await careApi.tasks('c_demo', filters)).tasks
  expect(ordinary.some((task) => task.dueAt === null)).toBe(false)
  const included = (await careApi.tasks('c_demo', { ...filters, includeUndated: true })).tasks
  expect(included.some((task) => task.title === input.title)).toBe(true)
  expect(included.some((task) => task.title === 'Undated Frank task' || task.title === 'Far future task')).toBe(false)
  expect((await careApi.tasks('c_demo', { ...filters, includeUndated: false })).tasks).toEqual(ordinary)
  const completed = (
    await careApi.tasks('c_demo', {
      dueBefore: filters.dueBefore,
      includeUndated: true,
      completedFrom: '2000-01-01T00:00:00Z',
      status: 'completed',
    })
  ).tasks
  expect(completed.every((task) => task.status === 'completed' && task.completedAt !== null)).toBe(true)
  const token = (await authApi.login(DEMO_ACCOUNT)).token
  const invalid = await fetch('/api/circles/c_demo/tasks?includeUndated=maybe', {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(invalid.status).toBe(400)
})
