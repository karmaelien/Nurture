import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import type { TaskRecurrence } from '../../api/types.ts'

afterEach(() => vi.useRealTimers())
async function create(count = 3) {
  vi.setSystemTime(new Date('2026-11-26T07:00:00Z'))
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const recurrence: TaskRecurrence = {
    unit: 'days',
    interval: 1,
    daysOfWeek: [],
    timeZone: 'UTC',
    end: { kind: 'afterOccurrences', count },
  }
  const body = {
    title: 'Recurring task sample',
    recipientId: 'r_rose',
    assignedCaregiverId: null,
    dueAt: '2026-11-26T08:00:00Z',
    recurrence,
  }
  const task = (await careApi.createTask('c_demo', body)).task
  const load = async () =>
    (
      await careApi.tasks('c_demo', { dueFrom: '2026-11-26T00:00:00Z', dueBefore: '2026-12-02T00:00:00Z' })
    ).tasks.filter((item) => item.seriesId === task.seriesId)
  return { task, load, body }
}

it('keeps occurrences independent and never recreates an edited or deleted occurrence', async () => {
  const { task, load } = await create()
  const [rows, concurrent] = await Promise.all([load(), load()])
  expect(rows).toHaveLength(3)
  expect(concurrent.map((task) => task.id)).toEqual(rows.map((task) => task.id))
  expect((await load()).map((task) => task.id)).toEqual(rows.map((task) => task.id))
  await careApi.updateTaskStatus('c_demo', rows[0].id, 'completed', 1)
  await careApi.updateTask('c_demo', rows[1].id, {
    recipientId: 'r_rose',
    title: 'Only this task',
    dueAt: null,
    assignedCaregiverId: null,
    version: 1,
  })
  await careApi.deleteTask('c_demo', rows[2].id, 1)
  await load()
  await careApi.tasks('c_demo')
  const saved = readDb().care.tasks.filter((item) => item.seriesId === task.seriesId)
  expect(saved).toHaveLength(2)
  expect(saved.find((item) => item.id === rows[0].id)?.status).toBe('completed')
  expect(saved.find((item) => item.id === rows[1].id)).toMatchObject({
    title: 'Only this task',
    dueAt: null,
    status: 'pending',
  })
})

it('stops future pending occurrences while preserving historical, undated, and completed tasks', async () => {
  const { task, load } = await create(5)
  const rows = await load()
  await careApi.updateTaskStatus('c_demo', rows[2].id, 'completed', 1)
  await careApi.updateTask('c_demo', rows[3].id, {
    recipientId: 'r_rose',
    title: 'Keep undated',
    dueAt: null,
    assignedCaregiverId: null,
    version: 1,
  })
  vi.setSystemTime(new Date('2026-11-27T09:00:00Z'))
  await careApi.stopTaskSeries('c_demo', task.seriesId!, 1)
  await load()
  await careApi.tasks('c_demo')
  const saved = readDb().care.tasks.filter((item) => item.seriesId === task.seriesId)
  expect(saved.map((item) => item.id).sort()).toEqual(
    rows
      .slice(0, 4)
      .map((item) => item.id)
      .sort(),
  )
  await expect(careApi.stopTaskSeries('c_demo', task.seriesId!, 1)).rejects.toMatchObject({ status: 409 })
  await careApi.stopTaskSeries('c_demo', task.seriesId!, 2)
  expect(readDb().taskSeries?.[0].version).toBe(2)
})

it('requires a valid future schedule and preserves saved series when storage or access fails', async () => {
  const { task, body } = await create()
  await expect(
    careApi.createTask('c_demo', { ...body, recurrence: { ...body.recurrence, unit: 'weeks', daysOfWeek: [] } }),
  ).rejects.toMatchObject({ status: 400 })
  await expect(careApi.createTask('c_demo', { ...body, dueAt: null })).rejects.toMatchObject({ status: 400 })
  await expect(careApi.createTask('c_demo', { ...body, dueAt: '2020-01-01T08:00:00Z' })).rejects.toMatchObject({
    status: 400,
  })
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError')
  })
  try {
    await expect(careApi.stopTaskSeries('c_demo', task.seriesId!, 1)).rejects.toMatchObject({ status: 503 })
  } finally {
    storage.mockRestore()
  }
  expect(readDb().taskSeries?.[0]).toMatchObject({ stoppedAt: null, version: 1 })
  const outsider = await authApi.register({
    name: 'Outsider',
    email: 'recurrence-outsider@example.test',
    password: 'password123',
  })
  setToken(outsider.token)
  await expect(careApi.stopTaskSeries('c_demo', task.seriesId!, 1)).rejects.toMatchObject({ status: 404 })
})

it('creates a repeating task through the form and confirms stopping from its existing editor', async () => {
  vi.setSystemTime(new Date(2026, 10, 26, 7))
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const user = userEvent.setup()
  renderApp('/app/tasks')
  const add = await screen.findByRole('button', { name: 'Add task' })
  await waitFor(() => expect(add).toBeEnabled())
  await user.click(add)
  let dialog = screen.getByRole('dialog', { name: 'Add task' })
  await user.type(within(dialog).getByLabelText('Task title'), 'Three daily tasks')
  fireEvent.change(within(dialog).getByLabelText('Due date (optional)'), { target: { value: '2026-11-26' } })
  await user.type(within(dialog).getByLabelText('Due time (optional)'), '8')
  await user.selectOptions(within(dialog).getByLabelText('Repeat'), 'days')
  await user.selectOptions(within(dialog).getByLabelText('Repeat ends'), 'afterOccurrences')
  fireEvent.change(within(dialog).getByLabelText('Number of tasks'), { target: { value: '3' } })
  await user.click(within(dialog).getByRole('button', { name: 'Save task' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const list = screen.getByRole('region', { name: 'Task list' })
  expect(await within(list).findAllByRole('button', { name: 'Edit task: Three daily tasks' })).toHaveLength(3)
  await user.click(within(list).getAllByRole('button', { name: 'Edit task: Three daily tasks' })[0])
  dialog = screen.getByRole('dialog', { name: 'Edit task' })
  expect(within(dialog).getByText(/Changes here apply only to this occurrence/)).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Stop repeating' }))
  expect(screen.getByRole('dialog', { name: 'Stop repeating?' })).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Confirm stop' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(readDb().taskSeries?.[0].stoppedAt).toBeTruthy()
  expect(readDb().care.tasks.some((task) => task.title === 'Three daily tasks')).toBe(false)
})

it.each(['/app/tasks', '/app'])(
  'uses the chosen due date for weekly defaults on %s and preserves explicit weekday choices',
  async (path) => {
    vi.setSystemTime(new Date(2026, 10, 26, 7))
    setToken((await authApi.login(DEMO_ACCOUNT)).token)
    const user = userEvent.setup()
    renderApp(path)
    const add = await screen.findByRole('button', { name: /^Add task$/i })
    await waitFor(() => expect(add).toBeEnabled())
    await user.click(add)
    const form = within(screen.getByRole('dialog', { name: 'Add task' }))
    await user.type(form.getByLabelText('Task title'), 'Weekly default test')
    fireEvent.change(form.getByLabelText('Due date (optional)'), { target: { value: '2026-11-30' } })
    await user.selectOptions(form.getByLabelText('Repeat'), 'weeks')
    expect(form.getByRole('checkbox', { name: 'Monday' })).toBeChecked()
    expect(form.getByRole('checkbox', { name: 'Thursday' })).not.toBeChecked()
    fireEvent.change(form.getByLabelText('Due date (optional)'), { target: { value: '2026-12-01' } })
    expect(form.getByRole('checkbox', { name: 'Tuesday' })).toBeChecked()
    expect(form.getByRole('checkbox', { name: 'Monday' })).not.toBeChecked()
    await user.click(form.getByRole('checkbox', { name: 'Tuesday' }))
    await user.click(form.getByRole('checkbox', { name: 'Wednesday' }))
    fireEvent.change(form.getByLabelText('Due date (optional)'), { target: { value: '2026-12-03' } })
    expect(form.getByRole('checkbox', { name: 'Wednesday' })).toBeChecked()
    expect(form.getByRole('checkbox', { name: 'Thursday' })).not.toBeChecked()
    await user.click(form.getByRole('button', { name: 'Save task' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(
      readDb().taskSeries?.find((series) => series.title === 'Weekly default test')?.recurrence.daysOfWeek,
    ).toEqual([3])
  },
)

it('validates weekly selections and saves an inclusive weekly end date', async () => {
  vi.setSystemTime(new Date(2026, 10, 26, 7))
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const user = userEvent.setup()
  renderApp('/app/tasks')
  const add = await screen.findByRole('button', { name: 'Add task' })
  await waitFor(() => expect(add).toBeEnabled())
  await user.click(add)
  const dialog = screen.getByRole('dialog', { name: 'Add task' })
  const form = within(dialog)
  await user.type(form.getByLabelText('Task title'), 'Fortnightly task')
  fireEvent.change(form.getByLabelText('Due date (optional)'), { target: { value: '2026-11-26' } })
  await user.type(form.getByLabelText('Due time (optional)'), '8')
  await user.selectOptions(form.getByLabelText('Repeat'), 'weeks')
  await user.click(form.getByRole('checkbox', { name: 'Select all' }))
  expect(form.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true)
  await user.click(form.getByRole('checkbox', { name: 'Select all' }))
  await user.click(form.getByRole('button', { name: 'Save task' }))
  expect(await form.findByRole('alert')).toHaveTextContent('Select at least one repeat day')
  await user.click(form.getByRole('checkbox', { name: 'Thursday' }))
  fireEvent.change(form.getByLabelText('Repeat every (weeks)'), { target: { value: '2' } })
  await user.selectOptions(form.getByLabelText('Repeat ends'), 'onDate')
  fireEvent.change(form.getByLabelText('Last repeat date'), { target: { value: '2026-12-10' } })
  await user.click(form.getByRole('button', { name: 'Save task' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const saved = (
    await careApi.tasks('c_demo', {
      dueFrom: new Date(2026, 10, 26).toISOString(),
      dueBefore: new Date(2026, 11, 11).toISOString(),
    })
  ).tasks.filter((task) => task.title === 'Fortnightly task')
  expect(saved).toHaveLength(2)
  expect(saved.map((task) => new Date(task.dueAt!).getDate())).toEqual([26, 10])
  expect(saved[0].seriesDescription).toContain('Every 2 weeks on Thu')
})

it('can stop a schedule even after its only materialized occurrence was deleted', async () => {
  const { task, body } = await create(1)
  // Use a long interval so no replacement is due in the default next-month window.
  const quarterly = (
    await careApi.createTask('c_demo', {
      ...body,
      title: 'Long interval task',
      recurrence: { ...body.recurrence, interval: 90, end: { kind: 'never' } },
    })
  ).task
  await careApi.deleteTask('c_demo', quarterly.id, 1)
  expect((await careApi.tasks('c_demo')).tasks.some((item) => item.seriesId === quarterly.seriesId)).toBe(false)
  const user = userEvent.setup()
  renderApp('/app/tasks')
  await user.click(await screen.findByText('Repeating Tasks'))
  await user.click(await screen.findByRole('button', { name: 'Stop repeating: Long interval task' }))
  const dialog = screen.getByRole('dialog', { name: 'Stop repeating?' })
  await user.click(within(dialog).getByRole('button', { name: 'Confirm stop' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(readDb().taskSeries?.find((item) => item.id === quarterly.seriesId)?.stoppedAt).toBeTruthy()
  const future = (await careApi.tasks('c_demo', { dueFrom: '2027-01-01T00:00:00Z', dueBefore: '2028-01-01T00:00:00Z' }))
    .tasks
  expect(future.some((item) => item.seriesId === quarterly.seriesId)).toBe(false)
  expect(readDb().care.tasks.some((item) => item.id === task.id)).toBe(true)
})
