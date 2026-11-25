import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { taskDueAt, taskInputSchema } from './task-input.ts'

async function login() {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
}
async function open() {
  await login()
  renderApp('/app/tasks')
  const user = userEvent.setup()
  const add = await screen.findByRole('button', { name: 'Add task' })
  await waitFor(() => expect(add).toBeEnabled())
  await user.click(add)
  return { user, dialog: screen.getByRole('dialog', { name: 'Add task' }) }
}

it('opens from shared navigation and filters the existing saved tasks', async () => {
  await login()
  const user = userEvent.setup()
  renderApp('/app')
  await user.click(await screen.findByRole('link', { name: 'Tasks' }))
  const list = await screen.findByRole('region', { name: 'Task list' })
  expect(await within(list).findByText('Pick up prescription')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Care profile'), 'r_frank')
  await waitFor(() => expect(within(list).queryByText('Pick up prescription')).not.toBeInTheDocument())
  expect(await within(list).findByText('Grocery delivery')).toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: 'Appointments' }))
  await screen.findByRole('heading', { name: 'Appointments', level: 1 })
  expect(screen.getByRole('link', { name: 'Tasks' })).toBeInTheDocument()
})

it('creates one task despite two immediate submissions and persists it', async () => {
  const { user, dialog } = await open()
  const form = within(dialog)
  await user.type(form.getByLabelText('Task title'), 'Arrange clinic transport')
  await user.selectOptions(form.getByLabelText('Care profile'), 'r_frank')
  await user.selectOptions(form.getByLabelText('Caregiver (optional)'), 'u_daniel')
  fireEvent.change(form.getByLabelText('Due date (optional)'), { target: { value: '2026-11-25' } })
  await user.type(form.getByLabelText('Due time (optional)'), '2:30')
  await user.selectOptions(form.getByLabelText('AM/PM'), 'PM')
  fireEvent.submit(dialog.querySelector('form')!)
  fireEvent.submit(dialog.querySelector('form')!)
  expect(await screen.findByRole('heading', { name: 'Arrange clinic transport' })).toBeInTheDocument()
  const saved = readDb().care.tasks.filter((task) => task.title === 'Arrange clinic transport')
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({
    recipientId: 'r_frank',
    assignedCaregiverId: 'u_daniel',
    status: 'pending',
    completedAt: null,
    dueAt: new Date('2026-11-25T14:30').toISOString(),
  })
  expect((await careApi.tasks('c_demo')).tasks.some((task) => task.id === saved[0].id)).toBe(true)
})

it('allows no due date and closes on click-away without saving', async () => {
  const { user, dialog } = await open()
  fireEvent.click(dialog, { clientX: -10, clientY: -10 })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: 'Add task' }))
  const form = within(screen.getByRole('dialog', { name: 'Add task' }))
  await user.type(form.getByLabelText('Task title'), 'Call pharmacy')
  await user.click(form.getByRole('button', { name: 'Save task' }))
  expect(await screen.findByRole('heading', { name: 'Call pharmacy' })).toBeInTheDocument()
  expect(readDb().care.tasks.find((task) => task.title === 'Call pharmacy')).toMatchObject({
    dueAt: null,
    assignedCaregiverId: null,
  })
})

it('reports a failed browser save without adding a task', async () => {
  const { user, dialog } = await open()
  await user.type(within(dialog).getByLabelText('Task title'), 'Unsaved task')
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError')
  })
  try {
    await user.click(within(dialog).getByRole('button', { name: 'Save task' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('could not be saved')
    expect(readDb().care.tasks.some((task) => task.title === 'Unsaved task')).toBe(false)
  } finally {
    storage.mockRestore()
  }
})

it('rejects unauthenticated and out-of-family creation', async () => {
  const input = { recipientId: 'r_rose', title: 'Check supplies', dueAt: null, assignedCaregiverId: null }
  await expect(careApi.createTask('c_demo', input)).rejects.toMatchObject({ status: 401 })
  await login()
  await expect(careApi.createTask('c_demo', { ...input, recipientId: 'unknown' })).rejects.toMatchObject({
    status: 404,
  })
  await expect(careApi.createTask('c_demo', { ...input, assignedCaregiverId: 'unknown' })).rejects.toMatchObject({
    status: 404,
  })
  const other = await authApi.register({ name: 'Other', email: 'tasks-outsider@example.test', password: 'password123' })
  setToken(other.token)
  await expect(careApi.createTask('c_demo', input)).rejects.toMatchObject({ status: 404 })
})

it('validates titles and converts optional typed due times without normalizing invalid dates', () => {
  expect(
    taskInputSchema.safeParse({ recipientId: 'r', title: '  ', dueAt: null, assignedCaregiverId: null }).success,
  ).toBe(false)
  expect(taskDueAt('', '', 'AM')).toBeNull()
  expect(taskDueAt('2026-11-25', '', 'AM')).toBe(new Date('2026-11-25T23:59').toISOString())
  expect(taskDueAt('2026-11-25', '12:00', 'AM')).toBe(new Date('2026-11-25T00:00').toISOString())
  expect(taskDueAt('2026-11-25', '12:00', 'PM')).toBe(new Date('2026-11-25T12:00').toISOString())
  expect(() => taskDueAt('', '9:30', 'AM')).toThrow('Choose a due date')
  expect(() => taskDueAt('2026-02-30', '9', 'AM')).toThrow('does not exist')
})
