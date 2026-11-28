import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { createTrackedMedication } from '../../test/medication-fixtures.ts'
import { server } from '../../test/setup.ts'

afterEach(() => vi.useRealTimers())
async function seed() {
  vi.setSystemTime(new Date(2026, 10, 26, 12))
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const db = readDb()
  const task = db.care.tasks[0]
  const appointment = db.care.appointments[0]
  const now = Date.now()
  db.care.tasks = [
    { ...task, id: 'late', title: 'Overdue task', dueAt: new Date(now - 1000).toISOString() },
    { ...task, id: 'soon', title: 'Future task', dueAt: new Date(now + 1000).toISOString() },
    { ...task, id: 'undated', dueAt: null },
    { ...task, id: 'complete', status: 'completed', completedAt: new Date(now).toISOString() },
  ]
  db.care.appointments = [0, 1].map((index) => ({
    ...appointment,
    id: `late-${index}`,
    startsAt: new Date(now - 7200000).toISOString(),
    endsAt: new Date(now - 3600000).toISOString(),
  }))
  db.care.medications = []
  db.care.medicationOccurrences = []
  writeDb(db)
  await createTrackedMedication('c_demo', {
    recipientId: 'r_frank',
    name: 'Two missed takes',
    dosage: '1 tablet',
    assignedCaregiverId: null,
    schedule: {
      times: ['08:00', '20:00'],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startsOn: '2026-11-25',
      end: { kind: 'onDate', date: '2026-11-25' },
    },
  })
}

it('combines overdue categories once, counts individual missed takes, and follows Home filters', async () => {
  await seed()
  const user = userEvent.setup()
  renderApp('/app')
  const summary = await screen.findByRole('region', { name: 'Attention Needed' })
  expect(screen.queryByText(/Outstanding tasks ·/)).not.toBeInTheDocument()
  expect(screen.queryByText('Today’s doses completed')).not.toBeInTheDocument()
  expect(screen.queryByText('Upcoming appointments · next 7 days')).not.toBeInTheDocument()
  expect(await within(summary).findByRole('button', { name: '1 overdue task' })).toHaveAttribute(
    'aria-haspopup',
    'dialog',
  )
  expect(await within(summary).findByRole('button', { name: '2 overdue appointments' })).toHaveAttribute(
    'aria-haspopup',
    'dialog',
  )
  expect(await within(summary).findByRole('button', { name: '2 missed doses' })).toHaveAttribute(
    'aria-haspopup',
    'dialog',
  )
  expect(screen.getAllByRole('region', { name: 'Attention Needed' })).toHaveLength(1)
  expect(await within(summary).findByRole('button', { name: '0 assistance notifications' })).toBeInTheDocument()
  expect(within(summary).getAllByRole('button')).toHaveLength(4)
  expect(screen.queryByRole('button', { name: 'View task reminders' })).not.toBeInTheDocument()

  await user.selectOptions(screen.getByLabelText('Care profile'), 'r_frank')
  await waitFor(() => expect(within(summary).getByRole('button', { name: '0 overdue tasks' })).toBeInTheDocument())
  expect(await within(summary).findByRole('button', { name: '0 overdue appointments' })).toBeInTheDocument()
  expect(await within(summary).findByRole('button', { name: '2 missed doses' })).toBeInTheDocument()
  await user.click(within(summary).getByRole('button', { name: '2 missed doses' }))
  expect(screen.getByRole('dialog', { name: 'Missed doses' })).toBeInTheDocument()
  await user.click(
    within(screen.getByRole('dialog', { name: 'Missed doses' })).getByRole('link', { name: 'Open Medications' }),
  )
  await screen.findByRole('heading', { name: 'Medications', level: 1 })
  expect(screen.getByLabelText('Care profile')).toHaveValue('r_frank')
  await user.click(await screen.findByRole('button', { name: '2 missed doses' }))
  expect(
    await within(screen.getByRole('region', { name: 'Attention Needed' })).findAllByRole('button', {
      name: /^Mark taken: Two missed takes/,
    }),
  ).toHaveLength(2)
})

it('uses the full missed count rather than the loaded page and labels unfinished history', async () => {
  await seed()
  server.use(
    http.get('/api/circles/:circleId/medication-occurrences/overdue', () =>
      HttpResponse.json({
        medicationOccurrences: [],
        nextCursor: 'more',
        historyPending: true,
        totalOverdueCount: 250,
      }),
    ),
  )
  renderApp('/app')
  const summary = await screen.findByRole('region', { name: 'Attention Needed' })
  expect(await within(summary).findByRole('button', { name: 'At least 250 missed doses' })).toBeInTheDocument()
})

it('shows unavailable counts on errors, retries, and keeps zero counts after everything is resolved', async () => {
  await seed()
  let failing = true
  server.use(
    http.get('/api/circles/:circleId/medication-occurrences/overdue', () =>
      failing
        ? HttpResponse.json({ error: { code: 'unavailable', message: 'Missed count unavailable.' } }, { status: 502 })
        : undefined,
    ),
  )
  const user = userEvent.setup()
  renderApp('/app')
  const summary = await screen.findByRole('region', { name: 'Attention Needed' })
  expect(await within(summary).findByRole('button', { name: 'missed doses unavailable' })).toBeInTheDocument()
  expect(within(summary).queryByRole('button', { name: '0 missed doses' })).not.toBeInTheDocument()
  failing = false
  await user.click(within(summary).getByRole('button', { name: 'Retry missed doses' }))
  expect(await within(summary).findByRole('button', { name: '2 missed doses' })).toBeInTheDocument()
  cleanup()
  const db = readDb()
  db.care.tasks = []
  db.care.appointments = []
  db.care.medications = []
  db.care.medicationOccurrences = []
  writeDb(db)
  renderApp('/app')
  await screen.findByRole('region', { name: 'Medication Schedule' })
  await waitFor(() => expect(screen.getByRole('button', { name: '0 missed doses' })).toBeInTheDocument())
  expect((await careApi.tasks('c_demo')).tasks).toHaveLength(0)
})

it('hides cached summary counts after access is lost and restores them on retry', async () => {
  await seed()
  renderApp('/app')
  const summary = await screen.findByRole('region', { name: 'Attention Needed' })
  await within(summary).findByRole('button', { name: '2 missed doses' })
  server.use(
    http.get('/api/circles/:circleId/medication-occurrences/overdue', () =>
      HttpResponse.json({ error: { code: 'not_found', message: 'Access unavailable.' } }, { status: 404 }),
    ),
  )
  fireEvent.focus(window)
  expect(
    await within(summary).findByText('Care summary unavailable. Refresh to check your access.'),
  ).toBeInTheDocument()
  expect(within(summary).queryByRole('link')).not.toBeInTheDocument()
  server.resetHandlers()
  await userEvent.setup().click(within(summary).getByRole('button', { name: 'Retry care summary' }))
  expect(await within(summary).findByRole('button', { name: '2 missed doses' })).toBeInTheDocument()
})
