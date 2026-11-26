import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'
import { taskAttention } from './task-attention.ts'

afterEach(() => vi.useRealTimers())
const now = Date.parse('2026-11-26T12:00:00Z')
async function seed() {
  vi.setSystemTime(new Date(now))
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const db = readDb()
  const base = db.care.tasks[0]
  db.care.tasks = [
    {
      ...base,
      id: 'late',
      title: 'Late task',
      dueAt: new Date(now - 60_000).toISOString(),
      recipientId: 'r_rose',
      status: 'pending',
      completedAt: null,
    },
    {
      ...base,
      id: 'soon',
      title: 'Soon task',
      dueAt: new Date(now + 60 * 60_000).toISOString(),
      recipientId: 'r_frank',
      status: 'pending',
      completedAt: null,
    },
    {
      ...base,
      id: 'later',
      title: 'Later task',
      dueAt: new Date(now + 60 * 60_000 + 1).toISOString(),
      status: 'pending',
      completedAt: null,
    },
    { ...base, id: 'undated', title: 'Undated task', dueAt: null, status: 'pending', completedAt: null },
    {
      ...base,
      id: 'done',
      title: 'Finished task',
      dueAt: new Date(now - 60_000).toISOString(),
      status: 'completed',
      completedAt: new Date(now).toISOString(),
    },
  ]
  writeDb(db)
}

it('uses inclusive one-hour reminders, excludes completed/undated tasks, and switches to overdue after the deadline', async () => {
  await seed()
  const tasks = readDb().care.tasks
  expect(tasks.map((task) => taskAttention(task, now))).toEqual(['overdue', 'soon', null, null, null])
  expect(taskAttention({ ...tasks[0], dueAt: new Date(now).toISOString() }, now)).toBe('soon')
  expect(taskAttention({ ...tasks[0], dueAt: new Date(now).toISOString() }, now + 1)).toBe('overdue')
})

it('keeps reminders independent of task status and applies the care-profile filter', async () => {
  await seed()
  const user = userEvent.setup()
  renderApp('/app/tasks')
  const attention = await screen.findByRole('region', { name: 'Task Attention Needed' })
  expect(await within(attention).findByText('1 overdue task')).toBeInTheDocument()
  expect(attention).toHaveTextContent('1 due within 1 hour')
  await user.selectOptions(screen.getByLabelText('Status'), 'completed')
  await user.click(within(attention).getByRole('button', { name: 'View task reminders' }))
  expect(await within(attention).findByRole('heading', { name: 'Late task' })).toBeInTheDocument()
  expect(within(attention).getAllByRole('listitem')).toHaveLength(2)
  await user.selectOptions(screen.getByLabelText('Care profile'), 'r_frank')
  await waitFor(() => expect(within(attention).queryByRole('heading', { name: 'Late task' })).not.toBeInTheDocument())
  await waitFor(() =>
    expect(
      within(screen.getByRole('region', { name: 'Task Attention Needed' })).getByRole('heading', { name: 'Soon task' }),
    ).toBeInTheDocument(),
  )
})

it('clears completed reminders on Home and Tasks and preserves the saved completion', async () => {
  await seed()
  const user = userEvent.setup()
  renderApp('/app')
  const attention = await screen.findByRole('region', { name: 'Task Attention Needed' })
  await user.click(within(attention).getByRole('button', { name: 'View task reminders' }))
  await user.click(within(attention).getByRole('button', { name: 'Mark Completed: Late task' }))
  await waitFor(() => expect(within(attention).queryByRole('heading', { name: 'Late task' })).not.toBeInTheDocument())
  expect(readDb().care.tasks.find((task) => task.id === 'late')?.status).toBe('completed')
  cleanup()
  renderApp('/app/tasks')
  const tasksAttention = await screen.findByRole('region', { name: 'Task Attention Needed' })
  expect(await within(tasksAttention).findByText('0 overdue tasks')).toBeInTheDocument()
  expect(tasksAttention).toHaveTextContent('1 due within 1 hour')
})

it('hides task details on failed refresh and retries a 502 error', async () => {
  await seed()
  let failing = true
  server.use(
    http.get('/api/circles/:circleId/tasks', ({ request }) => {
      if (failing && new URL(request.url).searchParams.get('status') === 'pending')
        return HttpResponse.json({ error: { message: 'Unavailable' } }, { status: 502 })
    }),
  )
  const user = userEvent.setup()
  renderApp('/app/tasks')
  const attention = await screen.findByRole('region', { name: 'Task Attention Needed' })
  const retry = await within(attention).findByRole('button', { name: 'Retry task reminders' })
  expect(within(attention).queryByRole('list')).not.toBeInTheDocument()
  failing = false
  await user.click(retry)
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Task Attention Needed' })).toHaveTextContent('1 overdue task'),
  )
})
