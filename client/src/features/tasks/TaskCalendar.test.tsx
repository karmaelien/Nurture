import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it, vi } from 'vitest'
import { careApi } from '../../api/care.ts'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'

afterEach(() => vi.useRealTimers())
const fullDate = (day: number) => new Date(2026, 10, day).toLocaleDateString(undefined, { dateStyle: 'full' })
async function open(now = new Date(2026, 10, 26, 12)) {
  vi.setSystemTime(now)
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const db = readDb()
  const template = db.care.tasks[0]
  const at = (hour: number, minute = 0, day = 26) => new Date(2026, 10, day, hour, minute).toISOString()
  db.care.tasks = [
    { ...template, id: 'calendar', title: 'Calendar task', dueAt: at(8) },
    { ...template, id: 'second', title: 'Second task', dueAt: at(8, 10), assignedCaregiverId: null },
    { ...template, id: 'third', title: 'Third task', recipientId: 'r_frank', dueAt: at(8, 20) },
    { ...template, id: 'fourth', title: 'Fourth task', dueAt: at(8, 30), status: 'completed', completedAt: at(8, 35) },
    { ...template, id: 'later', title: 'Later task', dueAt: at(9) },
    { ...template, id: 'undated', title: 'Undated task', dueAt: null },
    { ...template, id: 'tomorrow', title: 'Tomorrow task', recipientId: 'r_frank', dueAt: at(0, 0, 27) },
  ]
  writeDb(db)
  renderApp('/app/tasks')
  const calendar = await screen.findByRole('region', { name: 'Task Calendar' })
  await within(calendar).findByRole('table')
  return { calendar, user: userEvent.setup() }
}

it('matches due-soon labels between calendar blocks, popup rows, and task list rows', async () => {
  const { calendar, user } = await open(new Date(2026, 10, 26, 7, 30))
  const block = within(calendar).getByRole('button', { name: /Calendar task for Rose.*Due soon/ })
  const list = screen.getByRole('region', { name: 'Task list' })
  const row = within(list).getByRole('heading', { name: 'Calendar task' }).closest('li')!
  expect(within(row).getByText('Due soon')).toBeInTheDocument()
  await user.click(block)
  expect(within(screen.getByRole('dialog', { name: 'Task Details' })).getByText('Due soon')).toBeInTheDocument()
})

it('shares case-insensitive title search and assignment filters across the list and calendar', async () => {
  const { calendar, user } = await open()
  const list = screen.getByRole('region', { name: 'Task list' })
  await user.type(screen.getByLabelText('Search tasks'), '  sEcOnD  ')
  expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  expect(within(list).getByRole('heading', { name: 'Second task' })).toBeInTheDocument()
  expect(within(calendar).getByRole('button', { name: /Second task for Rose/ })).toBeInTheDocument()
  expect(within(calendar).queryByRole('button', { name: /Calendar task for Rose/ })).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Caregiver'), 'unassigned')
  expect(within(list).getByRole('heading', { name: 'Second task' })).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Caregiver'), 'u_demo')
  expect(within(list).getByText('No tasks for the selected filters.')).toBeInTheDocument()
  expect(within(calendar).getByText('No tasks due this month.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '4 overdue tasks' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByLabelText('Search tasks')).toHaveValue('')
  expect(screen.getByLabelText('Caregiver')).toHaveValue('')
  expect(within(list).getAllByRole('listitem')).toHaveLength(7)
  expect(within(calendar).getByRole('button', { name: /Calendar task for Rose/ })).toBeInTheDocument()
})

it('closes a calendar task popup when its search filters change', async () => {
  const { calendar, user } = await open()
  await user.click(within(calendar).getByRole('button', { name: /Calendar task for Rose/ }))
  expect(screen.getByRole('dialog', { name: 'Task Details' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'Second' } })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('caps month blocks, expands all tasks for the date, and updates completed styling', async () => {
  const { calendar, user } = await open()
  expect(within(calendar).getByRole('button', { name: /Calendar task for Rose.*Overdue/ })).toHaveClass('border-danger')
  expect(within(calendar).queryByRole('button', { name: /Undated task for/ })).not.toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Task list' })).getByText('Undated task')).toBeInTheDocument()
  await user.click(within(calendar).getByRole('button', { name: /Show all tasks on/ }))
  const dialog = screen.getByRole('dialog', { name: 'Tasks' })
  expect(within(dialog).getAllByRole('listitem')).toHaveLength(5)
  expect(within(dialog).queryByText('Tomorrow task')).not.toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Mark Completed: Calendar task' }))
  await within(dialog).findByRole('button', { name: 'Mark To Do: Calendar task' })
  expect(within(calendar).getByRole('button', { name: /Calendar task for Rose.*Completed/ })).toHaveClass(
    'line-through',
  )
  fireEvent.click(dialog, { clientX: -10, clientY: -10 })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('uses hourly day/week rows and limits overflow to its hour', async () => {
  const { calendar, user } = await open()
  await user.click(within(calendar).getByRole('button', { name: 'Daily' }))
  expect(await within(calendar).findAllByRole('rowheader')).toHaveLength(24)
  await user.click(within(calendar).getByRole('button', { name: /Show all tasks at/ }))
  const dialog = screen.getByRole('dialog', { name: 'Tasks' })
  expect(within(dialog).getAllByRole('listitem')).toHaveLength(4)
  expect(within(dialog).queryByText('Later task')).not.toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Close' }))
  await user.click(within(calendar).getByRole('button', { name: 'Weekly' }))
  expect(await within(calendar).findAllByRole('rowheader')).toHaveLength(24)
  expect(within(calendar).getByRole('columnheader', { name: /Nov 22/ })).toBeInTheDocument()
  await user.click(within(calendar).getByRole('button', { name: `View tasks for ${fullDate(27)}` }))
  expect(within(screen.getByRole('dialog', { name: 'Tasks' })).getByText('Tomorrow task')).toBeInTheDocument()
})

it('prefills the clicked date and selected profile when adding from an empty day', async () => {
  const { calendar, user } = await open()
  await user.selectOptions(screen.getByLabelText('Care profile'), 'r_frank')
  await within(calendar).findByRole('table')
  const day = within(calendar).getByRole('button', { name: `View tasks for ${fullDate(28)}` })
  day.focus()
  await user.keyboard('{Enter}')
  const popup = screen.getByRole('dialog', { name: 'Tasks' })
  expect(within(popup).getByText('No tasks due for the selected filters on this date.')).toBeInTheDocument()
  await user.click(within(popup).getByRole('button', { name: 'Add task' }))
  const editor = screen.getByRole('dialog', { name: 'Add task' })
  expect(popup).not.toHaveAttribute('open')
  expect(within(editor).getByLabelText('Due date (optional)')).toHaveValue('2026-11-28')
  expect(within(editor).getByLabelText('Care profile')).toHaveValue('r_frank')
  await user.type(within(editor).getByLabelText('Task title'), 'Calendar addition')
  await user.click(within(editor).getByRole('button', { name: 'Save task' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(await within(calendar).findByRole('button', { name: /Calendar addition for Frank/ })).toBeInTheDocument()
  expect(readDb().care.tasks.find((task) => task.title === 'Calendar addition')).toMatchObject({
    recipientId: 'r_frank',
    dueAt: new Date(2026, 10, 28, 23, 59).toISOString(),
  })
})

it('opens existing edit and delete dialogs without stacking calendar popups', async () => {
  const { calendar, user } = await open()
  await user.click(within(calendar).getByRole('button', { name: /Calendar task for Rose/ }))
  let popup = screen.getByRole('dialog', { name: 'Task Details' })
  await user.click(within(popup).getByRole('button', { name: 'Edit task: Calendar task' }))
  const editor = screen.getByRole('dialog', { name: 'Edit task' })
  expect(popup).not.toHaveAttribute('open')
  await user.clear(within(editor).getByLabelText('Task title'))
  await user.type(within(editor).getByLabelText('Task title'), 'Renamed task')
  await user.click(within(editor).getByRole('button', { name: 'Save task' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await user.click(within(calendar).getByRole('button', { name: /Renamed task for Rose/ }))
  popup = screen.getByRole('dialog', { name: 'Task Details' })
  await user.click(within(popup).getByRole('button', { name: 'Delete task: Renamed task' }))
  const confirmation = screen.getByRole('dialog', { name: 'Delete task?' })
  expect(popup).not.toHaveAttribute('open')
  await user.click(within(confirmation).getByRole('button', { name: 'Delete task' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(within(calendar).queryByRole('button', { name: /Renamed task for Rose/ })).not.toBeInTheDocument()
  expect(readDb().care.tasks.some((task) => task.id === 'calendar')).toBe(false)
})

it('filters completed tasks and retains its viewed period when changing profiles', async () => {
  const { calendar, user } = await open()
  await user.selectOptions(screen.getByLabelText('Status'), 'completed')
  expect(await within(calendar).findByRole('button', { name: /Fourth task for Rose.*Completed/ })).toHaveClass(
    'line-through',
  )
  expect(within(calendar).queryByRole('button', { name: /Calendar task for Rose/ })).not.toBeInTheDocument()
  await user.click(within(calendar).getByRole('button', { name: 'Next month' }))
  await user.selectOptions(screen.getByLabelText('Care profile'), 'r_frank')
  await within(calendar).findByRole('heading', { name: 'December 2026' })
  await within(calendar).findByText('No tasks due this month.')
})

it('restores the preferred day after short months and handles weeks crossing a year boundary', async () => {
  const { calendar, user } = await open(new Date(2027, 0, 31, 12))
  await user.click(within(calendar).getByRole('button', { name: 'Next month' }))
  await user.click(within(calendar).getByRole('button', { name: 'Next month' }))
  await user.click(within(calendar).getByRole('button', { name: 'Daily' }))
  expect(
    within(calendar).getByRole('heading', {
      name: new Date(2027, 2, 31).toLocaleDateString(undefined, { dateStyle: 'full' }),
    }),
  ).toBeInTheDocument()
  await user.click(within(calendar).getByRole('button', { name: 'Today' }))
  await user.click(within(calendar).getByRole('button', { name: 'Monthly' }))
  await user.click(within(calendar).getByRole('button', { name: 'Previous month' }))
  await user.click(within(calendar).getByRole('button', { name: 'Daily' }))
  await user.click(within(calendar).getByRole('button', { name: 'Next day' }))
  await user.click(within(calendar).getByRole('button', { name: 'Weekly' }))
  expect(await within(calendar).findByRole('columnheader', { name: /Dec 27/ })).toBeInTheDocument()
  expect(within(calendar).getByRole('columnheader', { name: /Jan 2/ })).toBeInTheDocument()
})

it('hides stale popup controls on a failed refresh and retries the same calendar period', async () => {
  const { calendar, user } = await open()
  await user.click(within(calendar).getByRole('button', { name: /Calendar task for Rose/ }))
  expect(screen.getByRole('dialog', { name: 'Task Details' })).toBeInTheDocument()
  server.use(http.get('/api/circles/:circleId/tasks', () => new HttpResponse(null, { status: 502 })))
  fireEvent.focus(window)
  expect(await within(calendar).findByRole('alert')).toHaveTextContent('502')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  server.resetHandlers()
  await user.click(within(calendar).getByRole('button', { name: 'Try again' }))
  expect(await within(calendar).findByRole('button', { name: /Calendar task for Rose/ })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('keeps the main list bounded after future calendar browsing generates repeating tasks', async () => {
  const { calendar, user } = await open()
  await careApi.createTask('c_demo', {
    title: 'Future repeating visit',
    recipientId: 'r_rose',
    assignedCaregiverId: null,
    dueAt: new Date(2026, 11, 15, 8).toISOString(),
    recurrence: {
      unit: 'days',
      interval: 1,
      daysOfWeek: [],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      end: { kind: 'afterOccurrences', count: 2 },
    },
  })
  await user.click(within(calendar).getByRole('button', { name: 'Next month' }))
  expect(await within(calendar).findAllByRole('button', { name: /Future repeating visit for Rose/ })).toHaveLength(2)
  const list = screen.getByRole('region', { name: 'Task list' })
  fireEvent.focus(window)
  await within(list).findByRole('heading', { name: 'Undated task' })
  await waitFor(() =>
    expect(within(list).queryByRole('heading', { name: 'Future repeating visit' })).not.toBeInTheDocument(),
  )
  // A remount must not pull the now-persisted future occurrences into the current list either.
  await user.click(screen.getByRole('link', { name: 'Overview' }))
  await screen.findByRole('region', { name: 'Tasks' })
  await user.click(screen.getByRole('link', { name: 'Tasks' }))
  const remounted = await screen.findByRole('region', { name: 'Task list' })
  await within(remounted).findByRole('heading', { name: 'Undated task' })
  expect(within(remounted).queryByRole('heading', { name: 'Future repeating visit' })).not.toBeInTheDocument()
})
