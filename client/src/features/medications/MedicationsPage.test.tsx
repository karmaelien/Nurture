import { createTrackedMedication } from '../../test/medication-fixtures.ts'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { setToken } from '../../api/token.ts'
import type { MedicationInput } from '../../api/types.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'
import { dashboardWindow } from '../home/dashboard.ts'

async function logIn() {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
}

it.each(['/app', '/app/medications'])('hides cached attention data after a failed refresh on %s', async (path) => {
  vi.setSystemTime(new Date(2026, 10, 25, 12))
  try {
    await logIn()
    await createTrackedMedication('c_demo', {
      recipientId: 'r_rose',
      name: 'Attention refresh sample',
      dosage: '1 tablet',
      assignedCaregiverId: null,
      schedule: {
        times: ['08:00'],
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startsOn: '2026-11-25',
        end: { kind: 'never' },
      },
    })
    renderApp(path)
    const attention = await screen.findByRole('region', { name: 'Attention Needed' })
    await within(attention).findAllByRole('button', { name: /^Mark taken:/ })
    server.use(
      http.get('/api/circles/:circleId/medication-occurrences/overdue', () =>
        HttpResponse.json({ error: { code: 'not_found', message: 'Medication access unavailable.' } }, { status: 404 }),
      ),
      http.get('/api/circles/:circleId/medication-occurrences', () =>
        HttpResponse.json({ error: { code: 'unavailable', message: 'Medication refresh failed.' } }, { status: 502 }),
      ),
    )
    fireEvent.focus(window)
    await within(attention).findByText('Medication access unavailable.')
    expect(within(attention).queryAllByRole('button', { name: /^Mark taken:/ })).toHaveLength(0)
    expect(within(attention).queryAllByRole('listitem')).toHaveLength(0)
    expect(within(attention).queryByRole('button', { name: 'Show more missed doses' })).not.toBeInTheDocument()
    server.resetHandlers()
    await userEvent.setup().click(within(attention).getByRole('button', { name: 'Retry missed doses' }))
    await userEvent.setup().click(within(attention).getByRole('button', { name: 'Retry reminders' }))
    await within(attention).findAllByRole('button', { name: /^Mark taken:/ })
  } finally {
    vi.useRealTimers()
  }
})

it.each(['/app', '/app/medications'])(
  'views future medication doses and keeps that date across navigation from %s',
  async (path) => {
    vi.setSystemTime(new Date(2026, 11, 1, 12))
    try {
      await logIn()
      await careApi.createMedication('c_demo', {
        recipientId: 'r_rose',
        name: 'Future schedule sample',
        dosage: '1 tablet',
        assignedCaregiverId: null,
        schedule: {
          times: ['08:00'],
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          startsOn: '2026-12-02',
          end: { kind: 'afterDays', days: 1 },
        },
      })
      const user = userEvent.setup()
      renderApp(path)
      let schedule = await screen.findByRole('region', { name: 'Medication Schedule' })
      fireEvent.change(within(schedule).getByLabelText('Dose date'), { target: { value: '2026-12-02' } })
      expect(await within(schedule).findByText('Future schedule sample · 1 tablet')).toBeInTheDocument()
      expect(within(schedule).getByLabelText('Dose date')).toHaveValue('2026-12-02')
      if (path === '/app') {
        await user.click(screen.getByRole('link', { name: 'Medications' }))
        await screen.findByRole('heading', { name: 'Medications', level: 1 })
      } else {
        await user.click(screen.getByRole('link', { name: 'Overview' }))
        await screen.findByRole('heading', { name: 'A little clarity for your day.' })
      }
      schedule = screen.getByRole('region', { name: 'Medication Schedule' })
      expect(within(schedule).getByLabelText('Dose date')).toHaveValue('2026-12-02')
      expect(await within(schedule).findByText('Future schedule sample · 1 tablet')).toBeInTheDocument()
      await user.click(within(schedule).getByRole('button', { name: 'Today' }))
      expect(within(schedule).getByLabelText('Dose date')).toHaveValue('2026-12-01')
      await waitFor(() =>
        expect(within(schedule).queryByText('Future schedule sample · 1 tablet')).not.toBeInTheDocument(),
      )
    } finally {
      vi.useRealTimers()
    }
  },
)

it('keeps the selected profile and schedule date when navigating between Home and Medications', async () => {
  vi.setSystemTime(new Date(2026, 11, 3, 12))
  try {
    await logIn()
    const user = userEvent.setup()
    renderApp('/app')
    await user.selectOptions(await screen.findByLabelText('Showing'), 'r_frank')
    fireEvent.change(screen.getByLabelText('Dose date'), { target: { value: '2026-12-01' } })
    await user.click(screen.getByRole('link', { name: 'Medications' }))
    await screen.findByRole('heading', { name: 'Medications', level: 1 })
    expect(screen.getByLabelText('Showing')).toHaveValue('r_frank')
    expect(screen.getByLabelText('Dose date')).toHaveValue('2026-12-01')
    await user.selectOptions(screen.getByLabelText('Showing'), 'r_rose')
    fireEvent.change(screen.getByLabelText('Dose date'), { target: { value: '2026-12-02' } })
    await user.click(screen.getByRole('link', { name: 'Overview' }))
    await screen.findByRole('heading', { name: 'A little clarity for your day.' })
    expect(screen.getByLabelText('Showing')).toHaveValue('r_rose')
    expect(screen.getByLabelText('Dose date')).toHaveValue('2026-12-02')
    await user.click(
      within(screen.getByRole('region', { name: 'Medication Schedule' })).getByRole('button', { name: 'Today' }),
    )
    await user.click(screen.getByRole('link', { name: 'Medications' }))
    await screen.findByRole('heading', { name: 'Medications', level: 1 })
    expect(screen.getByLabelText('Dose date')).toHaveValue('2026-12-03')
  } finally {
    vi.useRealTimers()
  }
})

it('keeps profile and date selections separate for each family', async () => {
  vi.setSystemTime(new Date(2026, 11, 3, 12))
  try {
    const db = readDb()
    db.circles.push({
      ...db.circles[0],
      id: 'c_second',
      name: 'Second family',
      recipients: [{ ...db.circles[0].recipients[0], id: 'r_second' }],
    })
    writeDb(db)
    await logIn()
    const user = userEvent.setup()
    renderApp('/app/medications')
    await user.selectOptions(await screen.findByLabelText('Showing'), 'r_frank')
    fireEvent.change(screen.getByLabelText('Dose date'), { target: { value: '2026-12-01' } })
    await user.selectOptions(screen.getByLabelText('Care circle'), 'c_second')
    await waitFor(() => expect(screen.getByLabelText('Showing')).toHaveValue(''))
    expect(screen.getByLabelText('Dose date')).toHaveValue('2026-12-03')
    await user.selectOptions(screen.getByLabelText('Showing'), 'r_second')
    fireEvent.change(screen.getByLabelText('Dose date'), { target: { value: '2026-12-02' } })
    await user.selectOptions(screen.getByLabelText('Care circle'), 'c_demo')
    await waitFor(() => expect(screen.getByLabelText('Showing')).toHaveValue('r_frank'))
    expect(screen.getByLabelText('Dose date')).toHaveValue('2026-12-01')
  } finally {
    vi.useRealTimers()
  }
})

it.each(['/app', '/app/medications'])('shows one caregiver-loading error on %s', async (path) => {
  await logIn()
  server.use(
    http.get('/api/circles/:circleId', () =>
      HttpResponse.json({ error: { code: 'unavailable', message: 'Unavailable' } }, { status: 503 }),
    ),
  )
  renderApp(path)
  await screen.findByText('Caregiver names could not load.')
  expect(screen.getAllByText('Caregiver names could not load.')).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: 'Retry caregiver names' })).toHaveLength(1)
})

it.each(['/app', '/app/medications'])(
  'views saved dose history by date and care profile and can undo a taken dose on %s',
  async (path) => {
    vi.setSystemTime(new Date(2026, 11, 3, 12))
    try {
      await logIn()
      await createTrackedMedication('c_demo', {
        recipientId: 'r_rose',
        name: 'History sample',
        dosage: '1 tablet',
        assignedCaregiverId: null,
        schedule: {
          times: ['08:00'],
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          startsOn: '2026-12-01',
          end: { kind: 'onDate', date: '2026-12-02' },
        },
      })
      const dates = dashboardWindow(new Date(2026, 11, 2, 12))
      const { medicationOccurrences } = await careApi.medicationOccurrences('c_demo', {
        from: dates.todayStart,
        to: dates.tomorrowStart,
      })
      const dose = medicationOccurrences.find((item) => item.name === 'History sample')!
      await careApi.updateMedicationDose('c_demo', dose.id, 'completed', dose.version)
      const user = userEvent.setup()
      renderApp(path)
      const history = await screen.findByRole('region', { name: 'Medication Schedule' })
      expect(within(history).getByLabelText('Dose date')).toHaveValue('2026-12-03')
      fireEvent.change(within(history).getByLabelText('Dose date'), { target: { value: '2026-12-02' } })
      expect(await within(history).findByText(/^Taken on .+ at /)).toBeInTheDocument()
      await user.selectOptions(screen.getByLabelText('Showing'), 'r_frank')
      expect(
        await within(history).findByText('No doses scheduled on this date for this care profile.'),
      ).toBeInTheDocument()
      await user.selectOptions(screen.getByLabelText('Showing'), 'r_rose')
      await user.click(await within(history).findByRole('button', { name: /^Mark pending: History sample/ }))
      expect(await within(history).findByRole('button', { name: /^Mark taken: History sample/ })).toBeInTheDocument()
      expect(within(history).queryByText(/^Taken on .+ at /)).not.toBeInTheDocument()
      fireEvent.change(within(history).getByLabelText('Dose date'), { target: { value: '2026-12-01' } })
      expect(await within(history).findByText(/Dec 1, 2026/)).toBeInTheDocument()
      fireEvent.change(within(history).getByLabelText('Dose date'), { target: { value: '2026-11-30' } })
      expect(
        await within(history).findByText('No doses scheduled on this date for this care profile.'),
      ).toBeInTheDocument()
      fireEvent.change(within(history).getByLabelText('Dose date'), { target: { value: '' } })
      expect(within(history).getByText('Choose a date to view doses.')).toBeInTheDocument()
      await user.click(within(history).getByRole('button', { name: 'Today' }))
      expect(within(history).getByLabelText('Dose date')).toHaveValue('2026-12-03')
    } finally {
      vi.useRealTimers()
    }
  },
)

it('combines overdue doses and reminders in order without duplicating rows', async () => {
  vi.setSystemTime(new Date(2026, 11, 3, 11, 50))
  try {
    await logIn()
    const { medications } = await careApi.medications('c_demo')
    for (const medication of medications) await careApi.deleteMedication('c_demo', medication.id, medication.version)
    await createTrackedMedication('c_demo', {
      recipientId: 'r_rose',
      name: 'Attention sample',
      dosage: '1 tablet',
      assignedCaregiverId: null,
      schedule: {
        times: ['08:00', '12:00'],
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startsOn: '2026-12-03',
        end: { kind: 'onDate', date: '2026-12-03' },
        reminderBeforeMinutes: 15,
      },
    })
    const user = userEvent.setup()
    renderApp('/app/medications')
    let attention = await screen.findByRole('region', { name: 'Attention Needed' })
    await waitFor(() => expect(within(attention).getAllByRole('listitem')).toHaveLength(2))
    const rows = within(attention).getAllByRole('listitem')
    expect(within(rows[0]).getByText('Missed')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Due in 10 min')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Dose history' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Dose reminders' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Showing'), 'r_frank')
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Attention Needed' })).not.toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Showing'), 'r_rose')
    attention = await screen.findByRole('region', { name: 'Attention Needed' })
    await user.click(within(attention).getAllByRole('button', { name: /^Mark taken: Attention sample/ })[0])
    await waitFor(() => expect(within(attention).getAllByRole('listitem')).toHaveLength(1))
    expect(within(attention).getByText('Due in 10 min')).toBeInTheDocument()
    const doses = screen.getByRole('region', { name: 'Medication Schedule' })
    expect(await within(doses).findByText('1 / 2 taken')).toBeInTheDocument()
    await user.click(within(attention).getByRole('button', { name: /^Mark taken: Attention sample/ }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Attention Needed' })).not.toBeInTheDocument())
    expect(await within(doses).findByText('2 / 2 taken')).toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

it('opens from navigation and filters medications by care profile', async () => {
  await logIn()
  const user = userEvent.setup()
  renderApp('/app')
  await user.click(await screen.findByRole('link', { name: 'Medications' }))
  await screen.findByRole('heading', { name: 'Medications', level: 1 })
  expect(await screen.findByRole('heading', { name: 'Sample medication A' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Sample medication B' })).toBeInTheDocument()
  const list = screen.getByRole('region', { name: 'Medication List' })
  expect(within(list).getByText('Daily · 8 AM, 8 PM')).toBeInTheDocument()
  expect(await within(list).findByText('Maya Alvarez')).toBeInTheDocument()
  expect(await within(list).findByText('Daniel Alvarez')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Showing'), 'r_frank')
  expect(screen.queryByRole('heading', { name: 'Sample medication A' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Sample medication B' })).toBeInTheDocument()
})

it('shows an empty list without inventing medications', async () => {
  await logIn()
  server.use(http.get('/api/circles/:circleId/medications', () => HttpResponse.json({ medications: [] })))
  renderApp('/app/medications')
  expect(await screen.findByText('No medications for this family.')).toBeInTheDocument()
})

it('lets the user retry a failed medication request', async () => {
  await logIn()
  server.use(
    http.get('/api/circles/:circleId/medications', () => new HttpResponse(null, { status: 503 }), { once: true }),
  )
  const user = userEvent.setup()
  renderApp('/app/medications')
  await user.click(await screen.findByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { name: 'Sample medication A' })).toBeInTheDocument()
})

it('rejects medication requests without a session or membership', async () => {
  await expect(careApi.medications('c_demo')).rejects.toMatchObject({ status: 401 })
  const { token } = await authApi.register({
    name: 'Another caregiver',
    email: 'another@example.test',
    password: 'password123',
  })
  setToken(token)
  await expect(careApi.medications('c_demo')).rejects.toMatchObject({ status: 404 })
})

it.each(['/app', '/app/medications'])(
  'adds a medication with multiple daily times and persists its definition on %s',
  async (path) => {
    await logIn()
    const user = userEvent.setup()
    renderApp(path)
    await user.selectOptions(await screen.findByLabelText('Showing'), 'r_frank')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add medication' })).toBeEnabled())
    await user.click(await screen.findByRole('button', { name: 'Add medication' }))
    const form = within(screen.getByRole('dialog', { name: 'Add Medication' }))
    const zoneOptions = within(form.getByLabelText('Time zone')).getAllByRole('option')
    const zoneLabels = zoneOptions.map((option) => option.textContent)
    expect(new Set(zoneLabels).size).toBe(zoneLabels.length)
    const offsets = zoneLabels.map((label) => {
      const match = /^\(UTC([+-])(\d{2}):(\d{2})\)/.exec(label!)!
      return (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '-' ? -1 : 1)
    })
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    expect(zoneLabels.some((label) => label?.endsWith('Eastern Time'))).toBe(true)
    await user.selectOptions(form.getByLabelText('Care profile'), 'r_frank')
    await user.type(form.getByLabelText('Medication name'), 'Test medication')
    await user.type(form.getByLabelText('Dosage'), '1 tablet')
    await user.type(form.getByLabelText('Dose time 1'), '8:00')
    await user.clear(form.getByLabelText('Doses per day'))
    await user.type(form.getByLabelText('Doses per day'), '2')
    await user.type(form.getByLabelText('Dose time 2'), '8:00')
    await user.selectOptions(form.getByLabelText('Dose 2 AM/PM'), 'PM')
    await user.selectOptions(form.getByLabelText('Time zone'), 'America/Chicago')
    await user.selectOptions(form.getByLabelText('Caregiver (optional)'), 'u_daniel')
    await user.click(form.getByRole('button', { name: 'Save medication' }))
    expect(await screen.findByRole('heading', { name: 'Test medication' })).toBeInTheDocument()
    expect(screen.getByLabelText('Showing')).toHaveValue('r_frank')
    const { medications } = await careApi.medications('c_demo')
    expect(medications.find((item) => item.name === 'Test medication')).toMatchObject({
      recipientId: 'r_frank',
      dosage: '1 tablet',
      assignedCaregiverId: 'u_daniel',
      schedule: { times: ['08:00', '20:00'], timeZone: 'America/Chicago' },
    })
  },
)

it('rejects duplicate times and lets the user dismiss the form by clicking outside', async () => {
  await logIn()
  const user = userEvent.setup()
  renderApp('/app/medications')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add medication' })).toBeEnabled())
  await user.click(await screen.findByRole('button', { name: 'Add medication' }))
  const dialog = screen.getByRole('dialog', { name: 'Add Medication' })
  const form = within(dialog)
  await user.type(form.getByLabelText('Medication name'), 'Not saved')
  await user.type(form.getByLabelText('Dosage'), '1 tablet')
  await user.type(form.getByLabelText('Dose time 1'), '9')
  await user.clear(form.getByLabelText('Doses per day'))
  await user.type(form.getByLabelText('Doses per day'), '2')
  await user.type(form.getByLabelText('Dose time 2'), '9:00')
  await user.click(form.getByRole('button', { name: 'Save medication' }))
  expect(await form.findByRole('alert')).toHaveTextContent('Each dose time must be different.')
  fireEvent.click(dialog, { clientX: -1, clientY: -1 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect((await careApi.medications('c_demo')).medications.some((item) => item.name === 'Not saved')).toBe(false)
})

it('rejects invalid schedules and assignments outside the selected family', async () => {
  await logIn()
  const body: MedicationInput = {
    recipientId: 'r_rose',
    name: 'Test medication',
    dosage: '1 tablet',
    schedule: {
      times: ['08:00'],
      timeZone: 'America/New_York',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startsOn: '2026-12-01',
      end: { kind: 'never' },
    },
    assignedCaregiverId: null,
  }
  await expect(createTrackedMedication('c_demo', { ...body, assignedCaregiverId: 'outsider' })).rejects.toMatchObject({
    status: 404,
  })
  await expect(createTrackedMedication('c_demo', { ...body, recipientId: 'outsider' })).rejects.toMatchObject({
    status: 404,
  })
  await expect(
    createTrackedMedication('c_demo', { ...body, schedule: { ...body.schedule, times: ['25:00'], timeZone: 'UTC' } }),
  ).rejects.toMatchObject({ status: 400 })
})

it('saves a weekly course with twice-per-day times and a fixed duration', async () => {
  await logIn()
  const user = userEvent.setup()
  renderApp('/app/medications')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add medication' })).toBeEnabled())
  await user.click(await screen.findByRole('button', { name: 'Add medication' }))
  const form = within(screen.getByRole('dialog', { name: 'Add Medication' }))
  await user.type(form.getByLabelText('Medication name'), 'Weekly sample')
  await user.type(form.getByLabelText('Dosage'), '1 tablet')
  await user.click(form.getByLabelText('Select all'))
  await user.click(form.getByLabelText('Wednesday'))
  await user.clear(form.getByLabelText('Doses per day'))
  await user.type(form.getByLabelText('Doses per day'), '2')
  await user.type(form.getByLabelText('Dose time 1'), '9')
  await user.type(form.getByLabelText('Dose time 2'), '9')
  await user.selectOptions(form.getByLabelText('Dose 2 AM/PM'), 'PM')
  fireEvent.change(form.getByLabelText('Start date'), { target: { value: '2026-12-01' } })
  await user.selectOptions(form.getByLabelText('Ends'), 'afterDays')
  await user.type(form.getByLabelText('Number of days'), '10')
  await user.click(form.getByRole('button', { name: 'Save medication' }))
  expect(await screen.findByRole('heading', { name: 'Weekly sample' })).toBeInTheDocument()
  expect(screen.getByText('Wed · 9 AM, 9 PM')).toBeInTheDocument()
  expect(
    (await careApi.medications('c_demo')).medications.find((item) => item.name === 'Weekly sample')?.schedule,
  ).toMatchObject({
    daysOfWeek: [3],
    times: ['09:00', '21:00'],
    startsOn: '2026-12-01',
    end: { kind: 'afterDays', days: 10 },
  })
})

it('matches the dose count to the time fields and preserves the first entered time', async () => {
  await logIn()
  const user = userEvent.setup()
  renderApp('/app/medications')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add medication' })).toBeEnabled())
  await user.click(await screen.findByRole('button', { name: 'Add medication' }))
  const form = within(screen.getByRole('dialog', { name: 'Add Medication' }))
  await user.type(form.getByLabelText('Dose time 1'), '7:30')
  await user.clear(form.getByLabelText('Doses per day'))
  await user.type(form.getByLabelText('Doses per day'), '3')
  expect(form.getByLabelText('Dose time 1')).toHaveValue('7:30')
  expect(form.getByLabelText('Dose time 2')).toBeInTheDocument()
  expect(form.getByLabelText('Dose time 3')).toBeInTheDocument()
  await user.clear(form.getByLabelText('Doses per day'))
  await user.type(form.getByLabelText('Doses per day'), '2')
  expect(form.getByLabelText('Doses per day')).toHaveValue(2)
  expect(form.queryByLabelText('Dose time 3')).not.toBeInTheDocument()
})

it('preserves older saved medication definitions when upgrading their schedules', async () => {
  await logIn()
  const { readDb } = await import('../../mocks/db.ts')
  const db = readDb()
  const key = Object.keys(localStorage).find((item) => item.startsWith('nurture.mock-db.'))!
  localStorage.setItem(
    key,
    JSON.stringify({
      ...db,
      care: {
        ...db.care,
        medications: [
          {
            ...db.care.medications[0],
            name: 'Existing medication',
            schedule: { times: ['07:00'], timeZone: 'Asia/Tokyo' },
          },
        ],
      },
    }),
  )
  expect((await careApi.medications('c_demo')).medications[0]).toMatchObject({
    name: 'Existing medication',
    schedule: { times: ['07:00'], timeZone: 'Asia/Tokyo', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], end: { kind: 'never' } },
  })
})

it('requires selected weekdays and saves a course ending on an inclusive date', async () => {
  await logIn()
  const user = userEvent.setup()
  renderApp('/app/medications')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add medication' })).toBeEnabled())
  await user.click(await screen.findByRole('button', { name: 'Add medication' }))
  const form = within(screen.getByRole('dialog', { name: 'Add Medication' }))
  await user.type(form.getByLabelText('Medication name'), 'Weekday sample')
  await user.type(form.getByLabelText('Dosage'), '1 tablet')
  await user.click(form.getByLabelText('Select all'))
  await user.type(form.getByLabelText('Dose time 1'), '8')
  fireEvent.change(form.getByLabelText('Start date'), { target: { value: '2026-12-01' } })
  await user.selectOptions(form.getByLabelText('Ends'), 'onDate')
  fireEvent.change(form.getByLabelText('End date'), { target: { value: '2026-12-31' } })
  await user.click(form.getByRole('button', { name: 'Save medication' }))
  expect(await form.findByRole('alert')).toHaveTextContent('Choose at least one weekday.')
  await user.click(form.getByLabelText('Monday'))
  await user.click(form.getByLabelText('Wednesday'))
  await user.click(form.getByLabelText('Friday'))
  await user.click(form.getByRole('button', { name: 'Save medication' }))
  expect(await screen.findByRole('heading', { name: 'Weekday sample' })).toBeInTheDocument()
  expect(
    (await careApi.medications('c_demo')).medications.find((item) => item.name === 'Weekday sample')?.schedule,
  ).toMatchObject({
    daysOfWeek: [1, 3, 5],
    startsOn: '2026-12-01',
    end: { kind: 'onDate', date: '2026-12-31' },
  })
})

it.each(['/app', '/app/medications'])(
  'prefills the edit form and persists changes without resetting the schedule on %s',
  async (path) => {
    await logIn()
    const { medication } = await createTrackedMedication('c_demo', {
      recipientId: 'r_frank',
      name: 'Editable sample',
      dosage: '1 tablet',
      assignedCaregiverId: 'u_daniel',
      schedule: {
        times: ['00:05', '15:30'],
        overdueAfterMinutes: 45,
        reminderBeforeMinutes: 20,
        timeZone: 'America/Chicago',
        daysOfWeek: [1, 5],
        startsOn: '2026-12-01',
        end: { kind: 'afterDays', days: 10 },
      },
    })
    const user = userEvent.setup()
    renderApp(path)
    const card = (await screen.findByRole('heading', { name: 'Editable sample' })).closest('li')!
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Edit medication' })).toBeEnabled())
    await user.click(within(card).getByRole('button', { name: 'Edit medication' }))
    const form = within(screen.getByRole('dialog', { name: 'Edit Medication' }))
    expect(form.getByLabelText('Care profile')).toHaveValue('r_frank')
    expect(form.getByLabelText('Missed after (minutes)')).toHaveValue(45)
    expect(form.getByLabelText('Remind before (minutes) (optional)')).toHaveValue(20)
    expect(form.getByLabelText('Dose time 1')).toHaveValue('12:05')
    expect(form.getByLabelText('Dose 1 AM/PM')).toHaveValue('AM')
    expect(form.getByLabelText('Dose time 2')).toHaveValue('3:30')
    expect(form.getByLabelText('Dose 2 AM/PM')).toHaveValue('PM')
    expect(form.getByLabelText('Monday')).toBeChecked()
    expect(form.getByLabelText('Tuesday')).not.toBeChecked()
    expect(form.getByLabelText('Ends')).toHaveValue('afterDays')
    expect(form.getByLabelText('Number of days')).toHaveValue(10)
    expect(form.getByLabelText('Time zone')).toHaveValue('America/Chicago')
    expect(form.getByLabelText('Caregiver (optional)')).toHaveValue('u_daniel')
    await user.clear(form.getByLabelText('Dosage'))
    await user.type(form.getByLabelText('Dosage'), '2 tablets')
    await user.click(form.getByRole('button', { name: 'Save medication' }))
    expect(await screen.findByText('2 tablets')).toBeInTheDocument()
    const saved = (await careApi.medications('c_demo')).medications.find((item) => item.id === medication.id)
    expect(saved).toMatchObject({ dosage: '2 tablets', schedule: medication.schedule, version: 2 })
  },
)

it.each(['/app', '/app/medications'])(
  'requires confirmation before deleting a medication and its stored doses on %s',
  async (path) => {
    await logIn()
    const user = userEvent.setup()
    renderApp(path)
    const card = (await screen.findByRole('heading', { name: 'Sample medication A' })).closest('li')!
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Delete permanently' })).toBeEnabled())
    await user.click(within(card).getByRole('button', { name: 'Delete permanently' }))
    let dialog = within(screen.getByRole('dialog', { name: 'Delete Permanently' }))
    await user.click(dialog.getByRole('button', { name: 'Keep medication' }))
    expect(screen.getByRole('heading', { name: 'Sample medication A' })).toBeInTheDocument()
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Delete permanently' })).toBeEnabled())
    await user.click(within(card).getByRole('button', { name: 'Delete permanently' }))
    dialog = within(screen.getByRole('dialog', { name: 'Delete Permanently' }))
    await user.click(dialog.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Sample medication A' })).not.toBeInTheDocument())
    expect((await careApi.medications('c_demo')).medications.some((item) => item.id === 'med_rose')).toBe(false)
    const { readDb } = await import('../../mocks/db.ts')
    expect(readDb().care.medicationOccurrences.some((dose) => dose.medicationId === 'med_rose')).toBe(false)
  },
)

it.each(['/app', '/app/medications'])(
  'confirms stopping separately, supports click-away, and keeps the medication and its history visible on %s',
  async (path) => {
    await logIn()
    const user = userEvent.setup()
    renderApp(path)
    const card = (await screen.findByRole('heading', { name: 'Sample medication A' })).closest('li')!
    const stop = within(card).getByRole('button', { name: 'Stop medication' })
    await waitFor(() => expect(stop).toBeEnabled())
    await user.click(stop)
    fireEvent.click(screen.getByRole('dialog', { name: 'Stop Medication' }), { clientX: -1, clientY: -1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      (await careApi.medications('c_demo')).medications.find((item) => item.id === 'med_rose')?.stoppedAt,
    ).toBeFalsy()
    await user.click(stop)
    const dialog = within(screen.getByRole('dialog', { name: 'Stop Medication' }))
    expect(dialog.getByText(/Past taken and missed doses stay/)).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Confirm stop' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(card).getByText(/^Stopped on /)).toBeInTheDocument()
    expect(within(card).queryByText(/ongoing/)).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Stop medication' })).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Edit medication' })).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Delete permanently' })).toBeEnabled()
    expect(
      (await careApi.medications('c_demo')).medications.find((item) => item.id === 'med_rose')?.stoppedAt,
    ).toBeTruthy()
  },
)

it.each(['/app', '/app/medications'])(
  'restarts a stopped medication as a separate course without changing its history or filling the gap on %s',
  async (path) => {
    vi.setSystemTime(new Date('2026-12-05T12:00:00Z'))
    try {
      await logIn()
      const { medication } = await createTrackedMedication('c_demo', {
        name: 'Restart sample',
        recipientId: 'r_rose',
        dosage: '1 tablet',
        assignedCaregiverId: 'u_daniel',
        schedule: {
          times: ['08:00', '20:00'],
          timeZone: 'UTC',
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          startsOn: '2026-12-01',
          end: { kind: 'onDate', date: '2026-12-02' },
          reminderBeforeMinutes: 15,
          overdueAfterMinutes: 30,
        },
      })
      const stopped = (await careApi.stopMedication('c_demo', medication.id, medication.version)).medication
      const range = { from: '2026-12-01T00:00:00Z', to: '2026-12-13T00:00:00Z' }
      const history = (await careApi.medicationOccurrences('c_demo', range)).medicationOccurrences.filter(
        (dose) => dose.medicationId === medication.id,
      )
      const user = userEvent.setup()
      renderApp(path)
      await user.selectOptions(await screen.findByLabelText('Showing'), 'r_rose')
      const card = (await screen.findByRole('heading', { name: 'Restart sample' })).closest('li')!
      const restart = within(card).getByRole('button', { name: 'Restart medication' })
      await waitFor(() => expect(restart).toBeEnabled())
      await user.click(restart)
      fireEvent.click(screen.getByRole('dialog', { name: 'Restart Medication' }), { clientX: -1, clientY: -1 })
      expect(
        (await careApi.medications('c_demo')).medications.filter((item) => item.name === 'Restart sample'),
      ).toHaveLength(1)
      await user.click(restart)
      const form = within(screen.getByRole('dialog', { name: 'Restart Medication' }))
      expect(form.getByLabelText('Medication name')).toHaveValue('Restart sample')
      expect(form.getByLabelText('Dosage')).toHaveValue('1 tablet')
      expect(form.getByLabelText('Doses per day')).toHaveValue(2)
      expect(form.getByLabelText('Caregiver (optional)')).toHaveValue('u_daniel')
      expect(form.getByLabelText('Start date')).toHaveValue('')
      expect(form.getByLabelText('End date')).toHaveValue('')
      fireEvent.change(form.getByLabelText('Start date'), { target: { value: '2026-12-10' } })
      fireEvent.change(form.getByLabelText('End date'), { target: { value: '2026-12-11' } })
      await user.click(form.getByRole('button', { name: 'Start new course' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByLabelText('Showing')).toHaveValue('r_rose')
      const courses = (await careApi.medications('c_demo')).medications.filter((item) => item.name === 'Restart sample')
      expect(courses).toHaveLength(2)
      expect(courses.find((item) => item.id === medication.id)).toEqual(stopped)
      const active = courses.find((item) => item.id !== medication.id)!
      expect(active.stoppedAt).toBeFalsy()
      const doses = (await careApi.medicationOccurrences('c_demo', range)).medicationOccurrences
      expect(doses.filter((dose) => dose.medicationId === medication.id)).toEqual(history)
      const newDoses = doses.filter((dose) => dose.medicationId === active.id)
      expect(newDoses).toHaveLength(4)
      expect(newDoses.every((dose) => dose.scheduledAt >= '2026-12-10' && dose.scheduledAt < '2026-12-12')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  },
)

it('rejects stale edits, duplicate deletion, and writes from outside the family', async () => {
  await logIn()
  const medication = (await careApi.medications('c_demo')).medications[0]
  const { id, ...body } = medication
  await careApi.updateMedication('c_demo', id, { ...body, dosage: 'Updated dosage' })
  await expect(careApi.updateMedication('c_demo', id, body)).rejects.toMatchObject({ status: 409 })
  await careApi.deleteMedication('c_demo', id, medication.version + 1)
  await expect(careApi.deleteMedication('c_demo', id, medication.version + 1)).rejects.toMatchObject({ status: 404 })
  await expect(careApi.updateMedication('c_demo', id, body)).rejects.toMatchObject({ status: 404 })
  const { token } = await authApi.register({ name: 'Other', email: 'other-med@example.test', password: 'password123' })
  setToken(token)
  await expect(careApi.updateMedication('c_demo', 'med_frank', body)).rejects.toMatchObject({ status: 404 })
  await expect(careApi.deleteMedication('c_demo', 'med_frank', 1)).rejects.toMatchObject({ status: 404 })
})

it('shares taken status between Medications and Home and preserves it after remount', async () => {
  vi.setSystemTime(new Date(2026, 11, 1, 12))
  try {
    await logIn()
    await createTrackedMedication('c_demo', {
      recipientId: 'r_rose',
      name: 'Parity sample',
      dosage: '1 tablet',
      assignedCaregiverId: null,
      schedule: {
        times: ['08:00'],
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startsOn: '2026-12-01',
        end: { kind: 'never' },
      },
    })
    const user = userEvent.setup()
    renderApp('/app/medications')
    const today = await screen.findByRole('region', { name: 'Medication Schedule' })
    const takeButton = await within(today).findByRole('button', { name: /^Mark taken: Parity sample/ })
    expect(within(takeButton.closest('li')!).getByText('Missed')).toBeInTheDocument()
    await user.click(takeButton)
    expect(await within(today).findByRole('button', { name: /^Mark pending: Parity sample/ })).toBeInTheDocument()
    expect(await within(today).findByText(/^Taken on .+ at /)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Overview' }))
    await screen.findByRole('heading', { name: 'A little clarity for your day.' })
    let home = await screen.findByRole('region', { name: 'Medication Schedule' })
    expect(await within(home).findByRole('button', { name: /^Mark pending: Parity sample/ })).toBeInTheDocument()
    const dates = dashboardWindow(new Date())
    const { medicationOccurrences } = await careApi.medicationOccurrences('c_demo', {
      from: dates.todayStart,
      to: dates.tomorrowStart,
    })
    expect(
      await screen.findByText(
        `${medicationOccurrences.filter((dose) => dose.status === 'completed').length} / ${medicationOccurrences.length}`,
      ),
    ).toBeInTheDocument()
    cleanup()
    renderApp('/app')
    home = await screen.findByRole('region', { name: 'Medication Schedule' })
    await user.click(await within(home).findByRole('button', { name: /^Mark pending: Parity sample/ }))
    await user.click(screen.getByRole('link', { name: 'Medications' }))
    await screen.findByRole('heading', { name: 'Medications', level: 1 })
    const restoredToday = await screen.findByRole('region', { name: 'Medication Schedule' })
    expect(await within(restoredToday).findByRole('button', { name: /^Mark taken: Parity sample/ })).toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

it('keeps a dose pending when recording it fails', async () => {
  await logIn()
  server.use(
    http.patch('/api/circles/:circleId/medication-occurrences/:occurrenceId', () =>
      HttpResponse.json({ error: { code: 'unavailable', message: 'Dose could not be saved.' } }, { status: 503 }),
    ),
  )
  const user = userEvent.setup()
  renderApp('/app/medications')
  const today = await screen.findByRole('region', { name: 'Medication Schedule' })
  await user.click(await within(today).findByRole('button', { name: /^Mark taken: Sample medication B/ }))
  expect(await within(today).findByRole('alert')).toHaveTextContent('Dose could not be saved.')
  expect(within(today).getByRole('button', { name: /^Mark taken: Sample medication B/ })).toBeEnabled()
})

it('generates doses once, retains status on refetch, and protects status writes', async () => {
  await logIn()
  const { medication } = await createTrackedMedication('c_demo', {
    recipientId: 'r_frank',
    name: 'Generated sample',
    dosage: '1 tablet',
    assignedCaregiverId: null,
    schedule: {
      times: ['08:00', '20:00'],
      timeZone: 'America/New_York',
      daysOfWeek: [1, 3, 5],
      startsOn: '2026-12-01',
      end: { kind: 'onDate', date: '2026-12-04' },
    },
  })
  const range = { from: '2026-12-01T00:00:00Z', to: '2026-12-06T00:00:00Z' }
  const load = async () =>
    (await careApi.medicationOccurrences('c_demo', range)).medicationOccurrences.filter(
      (dose) => dose.medicationId === medication.id,
    )
  const doses = await load()
  expect(doses.map((dose) => dose.scheduledAt)).toEqual([
    '2026-12-02T13:00:00.000Z',
    '2026-12-03T01:00:00.000Z',
    '2026-12-04T13:00:00.000Z',
    '2026-12-05T01:00:00.000Z',
  ])
  await careApi.updateMedicationDose('c_demo', doses[0].id, 'completed', (await load())[0].version)
  expect(await load()).toHaveLength(4)
  const recorded = (await load())[0]
  expect(recorded).toMatchObject({ id: doses[0].id, status: 'completed', takenAt: expect.any(String) })
  await careApi.updateMedicationDose('c_demo', doses[0].id, 'completed', (await load())[0].version)
  expect((await load())[0].takenAt).toBe(recorded.takenAt)
  await careApi.updateMedicationDose('c_demo', doses[0].id, 'pending', recorded.version)
  expect((await load())[0]).toMatchObject({ status: 'pending', takenAt: null })
  const { token } = await authApi.register({
    name: 'Outsider',
    email: 'dose-outsider@example.test',
    password: 'password123',
  })
  setToken(token)
  await expect(careApi.updateMedicationDose('c_demo', doses[0].id, 'pending', recorded.version)).rejects.toMatchObject({
    status: 404,
  })
})

it('shows today’s overdue doses on both pages and removes them when taken', async () => {
  vi.setSystemTime(new Date(2026, 11, 2, 12))
  try {
    await logIn()
    await createTrackedMedication('c_demo', {
      recipientId: 'r_rose',
      name: 'Today overdue sample',
      dosage: '1 tablet',
      assignedCaregiverId: null,
      schedule: {
        times: ['08:00', '20:00'],
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startsOn: '2026-12-02',
        end: { kind: 'onDate', date: '2026-12-02' },
      },
    })
    const user = userEvent.setup()
    renderApp('/app')
    let overdue = await screen.findByRole('region', { name: 'Attention Needed' })
    expect(within(overdue).getAllByText('Today overdue sample · 1 tablet')).toHaveLength(1)
    expect(within(overdue).getByText('1 missed dose')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Showing'), 'r_frank')
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Attention Needed' })).not.toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Showing'), '')
    await screen.findByRole('region', { name: 'Attention Needed' })
    await user.click(screen.getByRole('link', { name: 'Medications' }))
    await screen.findByRole('heading', { name: 'Medications', level: 1 })
    await screen.findByRole('heading', { name: 'Medications', level: 1 })
    overdue = await screen.findByRole('region', { name: 'Attention Needed' })
    await user.click(within(overdue).getByRole('button', { name: /^Mark taken: Today overdue sample/ }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Attention Needed' })).not.toBeInTheDocument())
    const dates = dashboardWindow(new Date())
    const { medicationOccurrences } = await careApi.medicationOccurrences('c_demo', {
      from: dates.todayStart,
      to: dates.tomorrowStart,
    })
    expect(
      medicationOccurrences.filter((dose) => dose.name === 'Today overdue sample').map((dose) => dose.status),
    ).toEqual(['completed', 'pending'])
  } finally {
    vi.useRealTimers()
  }
})

it('carries previous-day pending doses across both pages without changing today’s totals', async () => {
  vi.setSystemTime(new Date(2026, 11, 2, 12))
  try {
    await logIn()
    await createTrackedMedication('c_demo', {
      recipientId: 'r_rose',
      name: 'Yesterday sample',
      dosage: '1 tablet',
      assignedCaregiverId: null,
      schedule: {
        times: ['08:00'],
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startsOn: '2026-12-01',
        end: { kind: 'onDate', date: '2026-12-01' },
      },
    })
    const yesterday = dashboardWindow(new Date(2026, 11, 1, 12))
    await careApi.medicationOccurrences('c_demo', { from: yesterday.todayStart, to: yesterday.tomorrowStart })
    const user = userEvent.setup()
    renderApp('/app')
    let previous = await screen.findByRole('region', { name: 'Attention Needed' })
    expect(within(previous).getByText('Missed yesterday')).toBeInTheDocument()
    expect(within(previous).getByRole('button', { name: /^Mark taken: Yesterday sample/ })).toBeInTheDocument()
    expect(within(previous).getByText(/Dec 1, 2026/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Showing'), 'r_frank')
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Attention Needed' })).not.toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Showing'), '')
    await screen.findByRole('region', { name: 'Attention Needed' })
    await user.click(screen.getByRole('link', { name: 'Medications' }))
    await screen.findByRole('heading', { name: 'Medications', level: 1 })
    await screen.findByRole('heading', { name: 'Medications', level: 1 })
    previous = await screen.findByRole('region', { name: 'Attention Needed' })
    const dates = dashboardWindow(new Date())
    const loadToday = async () =>
      (await careApi.medicationOccurrences('c_demo', { from: dates.todayStart, to: dates.tomorrowStart }))
        .medicationOccurrences
    const before = await loadToday()
    await user.click(within(previous).getByRole('button', { name: /^Mark taken: Yesterday sample/ }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Attention Needed' })).not.toBeInTheDocument())
    expect(await loadToday()).toEqual(before)
    await user.click(screen.getByRole('link', { name: 'Overview' }))
    await screen.findByRole('heading', { name: 'A little clarity for your day.' })
    await screen.findByRole('region', { name: 'Medication Schedule' })
    expect(screen.queryByRole('region', { name: 'Attention Needed' })).not.toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

it('keeps older stored pending doses and honors grace periods crossing midnight', async () => {
  vi.setSystemTime(new Date('2026-12-02T00:10:00Z'))
  try {
    await logIn()
    const { medication } = await createTrackedMedication('c_demo', {
      recipientId: 'r_frank',
      name: 'Midnight sample',
      dosage: '1 tablet',
      assignedCaregiverId: null,
      schedule: {
        times: ['23:45'],
        timeZone: 'UTC',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startsOn: '2026-12-01',
        end: { kind: 'onDate', date: '2026-12-01' },
        overdueAfterMinutes: 60,
      },
    })
    await careApi.medicationOccurrences('c_demo', { from: '2026-12-01T00:00:00Z', to: '2026-12-02T00:00:00Z' })
    const tracked = new Set([medication.id])
    const load = async () =>
      (await careApi.overdueMedicationDoses('c_demo', '2026-12-02T00:00:00Z', 'r_frank')).medicationOccurrences.filter(
        (dose) => tracked.has(dose.medicationId),
      )
    expect(await load()).toHaveLength(0)
    vi.setSystemTime(new Date('2026-12-02T00:45:00Z'))
    expect((await load()).map((dose) => dose.medicationId)).toEqual([medication.id])
    const { medication: old } = await createTrackedMedication('c_demo', {
      recipientId: 'r_frank',
      name: 'Older stored sample',
      dosage: '1 tablet',
      assignedCaregiverId: null,
      schedule: {
        times: ['08:00'],
        timeZone: 'UTC',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startsOn: '2020-01-02',
        end: { kind: 'onDate', date: '2020-01-02' },
      },
    })
    tracked.add(old.id)
    await careApi.medicationOccurrences('c_demo', { from: '2020-01-02T00:00:00Z', to: '2020-01-03T00:00:00Z' })
    expect((await load()).map((dose) => dose.medicationId)).toEqual([old.id, medication.id])
    await expect(careApi.overdueMedicationDoses('c_demo', 'invalid')).rejects.toMatchObject({ status: 400 })
    await expect(careApi.overdueMedicationDoses('c_demo', '2026-12-02T00:00:00Z', 'outsider')).rejects.toMatchObject({
      status: 404,
    })
  } finally {
    vi.useRealTimers()
  }
})

it('shows both missed takes without visiting the earlier day and resolves them separately', async () => {
  vi.setSystemTime(new Date(2026, 11, 3, 12))
  try {
    await logIn()
    const { medication } = await createTrackedMedication('c_demo', {
      recipientId: 'r_frank',
      name: 'Twice sample',
      dosage: '1 tablet',
      assignedCaregiverId: null,
      schedule: {
        times: ['08:00', '20:00'],
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startsOn: '2026-12-02',
        end: { kind: 'onDate', date: '2026-12-02' },
      },
    })
    const { readDb } = await import('../../mocks/db.ts')
    expect(readDb().care.medicationOccurrences.filter((dose) => dose.medicationId === medication.id)).toHaveLength(0)
    const user = userEvent.setup()
    renderApp('/app/medications')
    const previous = await screen.findByRole('region', { name: 'Attention Needed' })
    expect(within(previous).getAllByText('Twice sample · 1 tablet')).toHaveLength(2)
    expect(within(previous).getByText('2 missed doses')).toBeInTheDocument()
    await user.click(within(previous).getAllByRole('button', { name: /^Mark taken: Twice sample/ })[0])
    expect(await within(previous).findByText('1 missed dose')).toBeInTheDocument()
    expect(within(previous).getAllByText('Twice sample · 1 tablet')).toHaveLength(1)
    const { medicationOccurrences } = await careApi.overdueMedicationDoses(
      'c_demo',
      dashboardWindow(new Date()).todayStart,
    )
    expect(medicationOccurrences.filter((dose) => dose.medicationId === medication.id)).toHaveLength(1)
  } finally {
    vi.useRealTimers()
  }
})

it('shows next-day reminders on both pages, filters them, and clears them when taken', async () => {
  vi.setSystemTime(new Date(2026, 11, 1, 23, 50))
  try {
    await logIn()
    await createTrackedMedication('c_demo', {
      recipientId: 'r_rose',
      name: 'Reminder sample',
      dosage: '1 tablet',
      assignedCaregiverId: null,
      schedule: {
        times: ['00:05'],
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startsOn: '2026-12-02',
        end: { kind: 'afterDays', days: 1 },
        reminderBeforeMinutes: 15,
      },
    })
    const user = userEvent.setup()
    renderApp('/app')
    let reminders = await screen.findByRole('region', { name: 'Attention Needed' })
    expect(await within(reminders).findByText('Due in 15 min')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Showing'), 'r_frank')
    await waitFor(() => expect(screen.queryByText('Reminder sample · 1 tablet')).not.toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Showing'), '')
    await screen.findByRole('region', { name: 'Attention Needed' })
    await user.click(screen.getByRole('link', { name: 'Medications' }))
    await screen.findByRole('heading', { name: 'Medications', level: 1 })
    await screen.findByRole('heading', { name: 'Medications', level: 1 })
    reminders = await screen.findByRole('region', { name: 'Attention Needed' })
    await user.click(within(reminders).getByRole('button', { name: /^Mark taken: Reminder sample/ }))
    await waitFor(() => expect(within(reminders).queryByText('Reminder sample · 1 tablet')).not.toBeInTheDocument())
    await user.click(screen.getByRole('link', { name: 'Overview' }))
    await screen.findByRole('heading', { name: 'A little clarity for your day.' })
    await screen.findByRole('region', { name: 'Medication Schedule' })
    expect(
      within(screen.getByRole('region', { name: 'Attention Needed' })).queryByText('Reminder sample · 1 tablet'),
    ).not.toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})
