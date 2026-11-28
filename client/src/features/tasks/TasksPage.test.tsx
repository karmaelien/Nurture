import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
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
  expect(() => taskDueAt('0000-01-01', '9:30', 'AM')).toThrow('Enter a valid due date.')
  expect(
    taskInputSchema.safeParse({
      recipientId: 'r',
      title: 'Task',
      dueAt: '0000-01-01T09:30:00Z',
      assignedCaregiverId: null,
    }).success,
  ).toBe(false)
  expect(() => taskDueAt('', '9:30', 'AM')).toThrow('Choose a due date')
  expect(() => taskDueAt('2026-02-30', '9', 'AM')).toThrow('does not exist')
})

it('completes a task once, moves it below pending tasks, and undoes it from Home', async () => {
  await login()
  const user = userEvent.setup()
  renderApp('/app/tasks')
  const list = await screen.findByRole('region', { name: 'Task list' })
  const entry = (await within(list).findByText('Pick up prescription')).closest('li')!
  const save = vi.spyOn(careApi, 'updateTaskStatus')
  try {
    const button = within(entry).getByRole('button', { name: 'Mark Completed: Pick up prescription' })
    fireEvent.click(button)
    fireEvent.click(button)
    await within(entry).findByText(/^Completed on /)
    expect(save).toHaveBeenCalledTimes(1)
    const rows = within(list).getAllByRole('listitem')
    expect(rows.indexOf(entry)).toBeGreaterThan(rows.findIndex((row) => row.textContent?.includes('Grocery delivery')))
    expect(readDb().care.tasks.find((task) => task.id === 't_overdue')).toMatchObject({
      status: 'completed',
      version: 2,
    })
    await user.click(screen.getByRole('link', { name: 'Overview' }))
    await screen.findByRole('heading', { name: 'Overview' })
    const homeEntry = (await screen.findByText('Pick up prescription')).closest('li')!
    await waitFor(() => {
      const count = readDb().care.tasks.filter(
        (task) =>
          ['r_rose', 'r_frank'].includes(task.recipientId) &&
          task.status === 'pending' &&
          task.dueAt &&
          Date.parse(task.dueAt) < Date.now(),
      ).length
      expect(
        screen.getByRole('button', { name: `${count} overdue ${count === 1 ? 'task' : 'tasks'}` }),
      ).toBeInTheDocument()
    })
    await user.click(within(homeEntry).getByRole('button', { name: 'Mark To Do: Pick up prescription' }))
    await within(homeEntry).findByRole('button', { name: 'Mark Completed: Pick up prescription' })
    const restoredOverdue = readDb().care.tasks.filter(
      (task) =>
        ['r_rose', 'r_frank'].includes(task.recipientId) &&
        task.status === 'pending' &&
        task.dueAt &&
        Date.parse(task.dueAt) < Date.now(),
    ).length
    expect(
      await screen.findByRole('button', {
        name: `${restoredOverdue} overdue ${restoredOverdue === 1 ? 'task' : 'tasks'}`,
      }),
    ).toBeInTheDocument()
    expect(within(homeEntry).queryByText(/^Completed on /)).not.toBeInTheDocument()
    expect(readDb().care.tasks.find((task) => task.id === 't_overdue')).toMatchObject({
      status: 'pending',
      completedAt: null,
      version: 3,
    })
  } finally {
    save.mockRestore()
  }
})

it('refreshes a stale row without overwriting a newer completion', async () => {
  await login()
  renderApp('/app/tasks')
  const list = await screen.findByRole('region', { name: 'Task list' })
  const entry = (await within(list).findByText('Pick up prescription')).closest('li')!
  await careApi.updateTaskStatus('c_demo', 't_overdue', 'completed', 1)
  fireEvent.click(within(entry).getByRole('button', { name: 'Mark Completed: Pick up prescription' }))
  expect(await within(entry).findByRole('alert')).toHaveTextContent('changed in another tab')
  await within(entry).findByRole('button', { name: 'Mark To Do: Pick up prescription' })
  expect(readDb().care.tasks.find((task) => task.id === 't_overdue')?.version).toBe(2)
})

it('serializes simultaneous saves and rejects stale changes even after undo', async () => {
  await login()
  const results = await Promise.allSettled([
    careApi.updateTaskStatus('c_demo', 't_overdue', 'completed', 1),
    careApi.updateTaskStatus('c_demo', 't_overdue', 'completed', 1),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
  const saved = readDb().care.tasks.find((task) => task.id === 't_overdue')!
  expect((await careApi.updateTaskStatus('c_demo', saved.id, 'completed', 2)).task).toEqual(saved)
  await careApi.updateTaskStatus('c_demo', saved.id, 'pending', 2)
  await expect(careApi.updateTaskStatus('c_demo', saved.id, 'completed', 1)).rejects.toMatchObject({ status: 409 })
  expect(readDb().care.tasks.find((task) => task.id === saved.id)?.version).toBe(3)
})

it('rejects inaccessible tasks, invalid versions, and failed persistence', async () => {
  await expect(careApi.updateTaskStatus('c_demo', 't_overdue', 'completed', 1)).rejects.toMatchObject({ status: 401 })
  await login()
  await expect(careApi.updateTaskStatus('c_demo', 'missing', 'completed', 1)).rejects.toMatchObject({ status: 404 })
  await expect(careApi.updateTaskStatus('c_demo', 't_overdue', 'completed', 0)).rejects.toMatchObject({ status: 400 })
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError')
  })
  try {
    await expect(careApi.updateTaskStatus('c_demo', 't_overdue', 'completed', 1)).rejects.toMatchObject({ status: 503 })
    expect(readDb().care.tasks.find((task) => task.id === 't_overdue')).toMatchObject({
      status: 'pending',
      completedAt: null,
      version: 1,
    })
  } finally {
    storage.mockRestore()
  }
  const db = readDb()
  db.circles[0].members = []
  writeDb(db)
  await expect(careApi.updateTaskStatus('c_demo', 't_overdue', 'completed', 1)).rejects.toMatchObject({ status: 404 })
})

it('edits all details from Home, submits once, and persists them on Tasks after a fresh mount', async () => {
  vi.setSystemTime(new Date(2026, 10, 26, 12))
  try {
    await login()
    const user = userEvent.setup()
    renderApp('/app')
    const edit = await screen.findByRole('button', { name: 'Edit task: Pick up prescription' })
    await waitFor(() => expect(edit).toBeEnabled())
    await user.click(edit)
    const dialog = screen.getByRole('dialog', { name: 'Edit task' })
    const form = within(dialog)
    expect(form.getByLabelText('Task title')).toHaveValue('Pick up prescription')
    await user.clear(form.getByLabelText('Task title'))
    await user.type(form.getByLabelText('Task title'), 'Collect supplies')
    await user.selectOptions(form.getByLabelText('Care profile'), 'r_frank')
    await user.selectOptions(form.getByLabelText('Caregiver (optional)'), 'u_daniel')
    fireEvent.change(form.getByLabelText('Due date (optional)'), { target: { value: '2026-11-27' } })
    fireEvent.change(form.getByLabelText('Due time (optional)'), { target: { value: '2:30' } })
    await user.selectOptions(form.getByLabelText('AM/PM'), 'PM')
    const save = vi.spyOn(careApi, 'updateTask')
    try {
      fireEvent.submit(dialog.querySelector('form')!)
      fireEvent.submit(dialog.querySelector('form')!)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(save).toHaveBeenCalledTimes(1)
    } finally {
      save.mockRestore()
    }
    expect(readDb().care.tasks.find((task) => task.id === 't_overdue')).toMatchObject({
      title: 'Collect supplies',
      recipientId: 'r_frank',
      assignedCaregiverId: 'u_daniel',
      dueAt: new Date('2026-11-27T14:30').toISOString(),
      status: 'pending',
      completedAt: null,
      version: 2,
    })
    cleanup()
    renderApp('/app/tasks')
    const list = await screen.findByRole('region', { name: 'Task list' })
    const entry = (await within(list).findByText('Collect supplies')).closest('li')!
    expect(within(entry).getByText('Frank Alvarez · Caregiver: Daniel Alvarez')).toBeInTheDocument()
    await user.click(within(entry).getByRole('button', { name: 'Edit task: Collect supplies' }))
    const updated = screen.getByRole('dialog', { name: 'Edit task' })
    expect(within(updated).getByLabelText('Due time (optional)')).toHaveValue('2:30')
    expect(within(updated).getByLabelText('AM/PM')).toHaveValue('PM')
    fireEvent.change(within(updated).getByLabelText('Due date (optional)'), { target: { value: '' } })
    await user.clear(within(updated).getByLabelText('Due time (optional)'))
    await user.selectOptions(within(updated).getByLabelText('Caregiver (optional)'), '')
    await user.click(within(updated).getByRole('button', { name: 'Save task' }))
    await waitFor(() => expect(updated).not.toBeInTheDocument())
    expect(readDb().care.tasks.find((task) => task.id === 't_overdue')).toMatchObject({
      dueAt: null,
      assignedCaregiverId: null,
      version: 3,
    })
  } finally {
    vi.useRealTimers()
  }
})

it('rejects an editor opened before completion and undo without overwriting its draft', async () => {
  await login()
  const user = userEvent.setup()
  renderApp('/app/tasks')
  const button = await screen.findByRole('button', { name: 'Edit task: Pick up prescription' })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
  const dialog = screen.getByRole('dialog', { name: 'Edit task' })
  await user.type(within(dialog).getByLabelText('Task title'), ' draft')
  await careApi.updateTaskStatus('c_demo', 't_overdue', 'completed', 1)
  await careApi.updateTaskStatus('c_demo', 't_overdue', 'pending', 2)
  await user.click(within(dialog).getByRole('button', { name: 'Save task' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Close and reopen the editor')
  expect(within(dialog).getByLabelText('Task title')).toHaveValue('Pick up prescription draft')
  expect(readDb().care.tasks.find((task) => task.id === 't_overdue')).toMatchObject({
    title: 'Pick up prescription',
    status: 'pending',
    version: 3,
  })
  fireEvent.click(dialog, { clientX: -10, clientY: -10 })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('preserves completion history and exact due timestamps when only the title changes', async () => {
  await login()
  const db = readDb()
  const task = db.care.tasks.find((task) => task.id === 't_overdue')!
  task.dueAt = '2026-11-01T06:30:45.123Z'
  writeDb(db)
  const completed = (await careApi.updateTaskStatus('c_demo', task.id, 'completed', 1)).task
  const user = userEvent.setup()
  renderApp('/app/tasks')
  const edit = await screen.findByRole('button', { name: 'Edit task: Pick up prescription' })
  await waitFor(() => expect(edit).toBeEnabled())
  await user.click(edit)
  const dialog = screen.getByRole('dialog', { name: 'Edit task' })
  await user.type(within(dialog).getByLabelText('Task title'), ' updated')
  await user.click(within(dialog).getByRole('button', { name: 'Save task' }))
  await waitFor(() => expect(dialog).not.toBeInTheDocument())
  const saved = readDb().care.tasks.find((task) => task.id === 't_overdue')!
  expect(saved).toMatchObject({
    dueAt: task.dueAt,
    status: 'completed',
    completedAt: completed.completedAt,
    version: 3,
  })
  const { recipientId, title, dueAt, assignedCaregiverId, version } = saved
  expect(
    (await careApi.updateTask('c_demo', saved.id, { recipientId, title, dueAt, assignedCaregiverId, version })).task
      .version,
  ).toBe(version)
})

it('validates edit assignments, serializes competing edits, and reports failed persistence', async () => {
  const body = { title: 'Updated task', recipientId: 'r_frank', assignedCaregiverId: null, dueAt: null, version: 1 }
  await expect(careApi.updateTask('c_demo', 't_overdue', body)).rejects.toMatchObject({ status: 401 })
  await login()
  await expect(careApi.updateTask('c_demo', 't_overdue', { ...body, recipientId: 'outside' })).rejects.toMatchObject({
    status: 404,
  })
  await expect(
    careApi.updateTask('c_demo', 't_overdue', { ...body, assignedCaregiverId: 'outside' }),
  ).rejects.toMatchObject({ status: 404 })
  await expect(careApi.updateTask('c_demo', 't_overdue', { ...body, version: 0 })).rejects.toMatchObject({
    status: 400,
  })
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError')
  })
  try {
    await expect(careApi.updateTask('c_demo', 't_overdue', body)).rejects.toMatchObject({ status: 503 })
    expect(readDb().care.tasks.find((task) => task.id === 't_overdue')).toMatchObject({
      title: 'Pick up prescription',
      version: 1,
    })
  } finally {
    storage.mockRestore()
  }
  const results = await Promise.allSettled([
    careApi.updateTask('c_demo', 't_overdue', body),
    careApi.updateTaskStatus('c_demo', 't_overdue', 'completed', 1),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
})

it.each(['/app/tasks', '/app'])(
  'confirms deletion on %s, supports click-away, and blocks duplicate saves and dismissal while deleting',
  async (path) => {
    await login()
    const user = userEvent.setup()
    renderApp(path)
    const openDelete = () => user.click(screen.getByRole('button', { name: 'Delete task: Pick up prescription' }))
    await screen.findByRole('button', { name: 'Delete task: Pick up prescription' })
    await openDelete()
    let dialog = screen.getByRole('dialog', { name: 'Delete task?' })
    expect(readDb().care.tasks.some((task) => task.id === 't_overdue')).toBe(true)
    fireEvent.click(dialog, { clientX: -10, clientY: -10 })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await openDelete()
    dialog = screen.getByRole('dialog', { name: 'Delete task?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await openDelete()
    dialog = screen.getByRole('dialog', { name: 'Delete task?' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = careApi.deleteTask
    const remove = vi.spyOn(careApi, 'deleteTask').mockImplementation(async (...args) => {
      await gate
      return original(...args)
    })
    try {
      const confirm = within(dialog).getByRole('button', { name: 'Delete task' })
      fireEvent.click(confirm)
      fireEvent.click(confirm)
      expect(remove).toHaveBeenCalledTimes(1)
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
      const cancel = new Event('cancel', { cancelable: true })
      fireEvent(dialog, cancel)
      expect(cancel.defaultPrevented).toBe(true)
      fireEvent.click(dialog, { clientX: -10, clientY: -10 })
      expect(dialog).toHaveAttribute('open')
      expect(readDb().care.tasks.some((task) => task.id === 't_overdue')).toBe(true)
      release()
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(readDb().care.tasks.some((task) => task.id === 't_overdue')).toBe(false)
      expect(screen.queryByRole('button', { name: 'Delete task: Pick up prescription' })).not.toBeInTheDocument()
      if (path === '/app')
        await waitFor(() => {
          const count = readDb().care.tasks.filter(
            (task) =>
              ['r_rose', 'r_frank'].includes(task.recipientId) &&
              task.status === 'pending' &&
              task.dueAt &&
              Date.parse(task.dueAt) < Date.now(),
          ).length
          expect(
            screen.getByRole('button', { name: `${count} overdue ${count === 1 ? 'task' : 'tasks'}` }),
          ).toBeInTheDocument()
        })
    } finally {
      release()
      remove.mockRestore()
    }
    cleanup()
    renderApp(path === '/app' ? '/app/tasks' : '/app')
    await screen.findByText('Grocery delivery')
    expect(screen.queryByText('Pick up prescription')).not.toBeInTheDocument()
  },
)

it('rejects stale deletion and retains the task after another caregiver completes it', async () => {
  await login()
  const user = userEvent.setup()
  renderApp('/app/tasks')
  await user.click(await screen.findByRole('button', { name: 'Delete task: Pick up prescription' }))
  const dialog = screen.getByRole('dialog', { name: 'Delete task?' })
  await careApi.updateTaskStatus('c_demo', 't_overdue', 'completed', 1)
  await user.click(within(dialog).getByRole('button', { name: 'Delete task' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Close and reopen the confirmation')
  expect(readDb().care.tasks.find((task) => task.id === 't_overdue')).toMatchObject({ status: 'completed', version: 2 })
  await user.click(within(dialog).getByRole('button', { name: 'Close' }))
  await user.click(screen.getByRole('button', { name: 'Delete task: Pick up prescription' }))
  const current = screen.getByRole('dialog', { name: 'Delete task?' })
  expect(within(current).getByText(/completion record/)).toBeInTheDocument()
  await user.click(within(current).getByRole('button', { name: 'Delete task' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(readDb().care.tasks.some((task) => task.id === 't_overdue')).toBe(false)
})

it('keeps a failed delete visible and retryable without removing the saved task', async () => {
  await login()
  const user = userEvent.setup()
  renderApp('/app/tasks')
  await user.click(await screen.findByRole('button', { name: 'Delete task: Pick up prescription' }))
  const dialog = screen.getByRole('dialog', { name: 'Delete task?' })
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError')
  })
  try {
    await user.click(within(dialog).getByRole('button', { name: 'Delete task' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('could not be saved')
    expect(readDb().care.tasks.some((task) => task.id === 't_overdue')).toBe(true)
  } finally {
    storage.mockRestore()
  }
  await user.click(within(dialog).getByRole('button', { name: 'Delete task' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(readDb().care.tasks.some((task) => task.id === 't_overdue')).toBe(false)
})

it('checks deletion access and versions and rejects a competing edit or delete', async () => {
  await expect(careApi.deleteTask('c_demo', 't_overdue', 1)).rejects.toMatchObject({ status: 401 })
  await login()
  await expect(careApi.deleteTask('c_demo', 'missing', 1)).rejects.toMatchObject({ status: 404 })
  await expect(careApi.deleteTask('c_demo', 't_overdue', 0)).rejects.toMatchObject({ status: 400 })
  await expect(careApi.deleteTask('c_demo', 't_overdue', 2)).rejects.toMatchObject({ status: 409 })
  const results = await Promise.allSettled([
    careApi.deleteTask('c_demo', 't_overdue', 1),
    careApi.updateTask('c_demo', 't_overdue', {
      recipientId: 'r_rose',
      title: 'New details',
      assignedCaregiverId: null,
      dueAt: null,
      version: 1,
    }),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  const failure = results.find((result) => result.status === 'rejected')
  expect(failure?.status === 'rejected' && [404, 409].includes(failure.reason.status)).toBe(true)
  const db = readDb()
  db.circles[0].members = []
  writeDb(db)
  await expect(careApi.deleteTask('c_demo', 't_today', 1)).rejects.toMatchObject({ status: 404 })
  expect(readDb().care.tasks.some((task) => task.id === 't_today')).toBe(true)
})
