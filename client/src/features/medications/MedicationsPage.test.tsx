import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { setToken } from '../../api/token.ts'
import type { MedicationInput } from '../../api/types.ts'
import { DEMO_ACCOUNT } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'
import { dashboardWindow } from '../home/dashboard.ts'

async function logIn() {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
}

it('views saved dose history by date and care profile and can undo a taken dose', async () => {
  vi.setSystemTime(new Date(2026, 11, 3, 12))
  try {
    await logIn()
    await careApi.createMedication('c_demo', {
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
    await careApi.updateMedicationDose('c_demo', dose.id, 'completed')
    const user = userEvent.setup()
    renderApp('/app/medications')
    const history = await screen.findByRole('region', { name: 'Doses' })
    expect(within(history).getByLabelText('Dose date')).toHaveValue('2026-12-03')
    fireEvent.change(within(history).getByLabelText('Dose date'), { target: { value: '2026-12-02' } })
    expect(await within(history).findByText(/^Taken on .+ at /)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Care profile'), 'r_frank')
    expect(
      await within(history).findByText('No doses scheduled on this date for this care profile.'),
    ).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Care profile'), 'r_rose')
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
})

it('combines overdue doses and reminders in order without duplicating rows', async () => {
  vi.setSystemTime(new Date(2026, 11, 3, 11, 50))
  try {
    await logIn()
    const { medications } = await careApi.medications('c_demo')
    for (const medication of medications) await careApi.deleteMedication('c_demo', medication.id)
    await careApi.createMedication('c_demo', {
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
    let attention = await screen.findByRole('region', { name: 'Attention needed' })
    await waitFor(() => expect(within(attention).getAllByRole('listitem')).toHaveLength(2))
    const rows = within(attention).getAllByRole('listitem')
    expect(within(rows[0]).getByText('Overdue')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Due in 10 min')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Dose history' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Dose reminders' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Care profile'), 'r_frank')
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Attention needed' })).not.toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Care profile'), 'r_rose')
    attention = await screen.findByRole('region', { name: 'Attention needed' })
    await user.click(within(attention).getAllByRole('button', { name: /^Mark taken: Attention sample/ })[0])
    await waitFor(() => expect(within(attention).getAllByRole('listitem')).toHaveLength(1))
    expect(within(attention).getByText('Due in 10 min')).toBeInTheDocument()
    const doses = screen.getByRole('region', { name: 'Doses' })
    expect(await within(doses).findByText('1 / 2 taken')).toBeInTheDocument()
    await user.click(within(attention).getByRole('button', { name: /^Mark taken: Attention sample/ }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Attention needed' })).not.toBeInTheDocument())
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
  expect(await screen.findByRole('heading', { name: 'Sample medication A' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Sample medication B' })).toBeInTheDocument()
  const list = screen.getByRole('region', { name: 'Medication list' })
  expect(within(list).getByText('Daily at 8:00 AM and 8:00 PM')).toBeInTheDocument()
  expect(await within(list).findByText('Maya Alvarez')).toBeInTheDocument()
  expect(await within(list).findByText('Daniel Alvarez')).toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Care profile'), 'r_frank')
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

it('adds a medication with multiple daily times and persists its definition', async () => {
  await logIn()
  const user = userEvent.setup()
  renderApp('/app/medications')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add medication' })).toBeEnabled())
  await user.click(await screen.findByRole('button', { name: 'Add medication' }))
  const form = within(screen.getByRole('dialog', { name: 'Add medication' }))
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
  const { medications } = await careApi.medications('c_demo')
  expect(medications.find((item) => item.name === 'Test medication')).toMatchObject({
    recipientId: 'r_frank',
    dosage: '1 tablet',
    assignedCaregiverId: 'u_daniel',
    schedule: { times: ['08:00', '20:00'], timeZone: 'America/Chicago' },
  })
})

it('rejects duplicate times and lets the user dismiss the form by clicking outside', async () => {
  await logIn()
  const user = userEvent.setup()
  renderApp('/app/medications')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add medication' })).toBeEnabled())
  await user.click(await screen.findByRole('button', { name: 'Add medication' }))
  const dialog = screen.getByRole('dialog', { name: 'Add medication' })
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
  await expect(careApi.createMedication('c_demo', { ...body, assignedCaregiverId: 'outsider' })).rejects.toMatchObject({
    status: 404,
  })
  await expect(careApi.createMedication('c_demo', { ...body, recipientId: 'outsider' })).rejects.toMatchObject({
    status: 404,
  })
  await expect(
    careApi.createMedication('c_demo', { ...body, schedule: { ...body.schedule, times: ['25:00'], timeZone: 'UTC' } }),
  ).rejects.toMatchObject({ status: 400 })
})

it('saves a weekly course with twice-per-day times and a fixed duration', async () => {
  await logIn()
  const user = userEvent.setup()
  renderApp('/app/medications')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add medication' })).toBeEnabled())
  await user.click(await screen.findByRole('button', { name: 'Add medication' }))
  const form = within(screen.getByRole('dialog', { name: 'Add medication' }))
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
  expect(screen.getByText('Every Wednesday at 9:00 AM and 9:00 PM')).toBeInTheDocument()
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
  const form = within(screen.getByRole('dialog', { name: 'Add medication' }))
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
  const form = within(screen.getByRole('dialog', { name: 'Add medication' }))
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

it('prefills the edit form and persists changes without resetting the schedule', async () => {
  await logIn()
  const { medication } = await careApi.createMedication('c_demo', {
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
  renderApp('/app/medications')
  const card = (await screen.findByRole('heading', { name: 'Editable sample' })).closest('li')!
  await waitFor(() => expect(within(card).getByRole('button', { name: 'Edit medication' })).toBeEnabled())
  await user.click(within(card).getByRole('button', { name: 'Edit medication' }))
  const form = within(screen.getByRole('dialog', { name: 'Edit medication' }))
  expect(form.getByLabelText('Care profile')).toHaveValue('r_frank')
  expect(form.getByLabelText('Overdue after (minutes)')).toHaveValue(45)
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
})

it('requires confirmation before deleting a medication and its stored doses', async () => {
  await logIn()
  const user = userEvent.setup()
  renderApp('/app/medications')
  const card = (await screen.findByRole('heading', { name: 'Sample medication A' })).closest('li')!
  await waitFor(() => expect(within(card).getByRole('button', { name: 'Delete medication' })).toBeEnabled())
  await user.click(within(card).getByRole('button', { name: 'Delete medication' }))
  let dialog = within(screen.getByRole('dialog', { name: 'Delete medication' }))
  await user.click(dialog.getByRole('button', { name: 'Keep medication' }))
  expect(screen.getByRole('heading', { name: 'Sample medication A' })).toBeInTheDocument()
  await waitFor(() => expect(within(card).getByRole('button', { name: 'Delete medication' })).toBeEnabled())
  await user.click(within(card).getByRole('button', { name: 'Delete medication' }))
  dialog = within(screen.getByRole('dialog', { name: 'Delete medication' }))
  await user.click(dialog.getByRole('button', { name: 'Confirm delete' }))
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Sample medication A' })).not.toBeInTheDocument())
  expect((await careApi.medications('c_demo')).medications.some((item) => item.id === 'med_rose')).toBe(false)
  const { readDb } = await import('../../mocks/db.ts')
  expect(readDb().care.medicationOccurrences.some((dose) => dose.medicationId === 'med_rose')).toBe(false)
})

it('rejects stale edits, duplicate deletion, and writes from outside the family', async () => {
  await logIn()
  const medication = (await careApi.medications('c_demo')).medications[0]
  const { id, ...body } = medication
  await careApi.updateMedication('c_demo', id, { ...body, dosage: 'Updated dosage' })
  await expect(careApi.updateMedication('c_demo', id, body)).rejects.toMatchObject({ status: 409 })
  await careApi.deleteMedication('c_demo', id)
  await expect(careApi.deleteMedication('c_demo', id)).rejects.toMatchObject({ status: 404 })
  await expect(careApi.updateMedication('c_demo', id, body)).rejects.toMatchObject({ status: 404 })
  const { token } = await authApi.register({ name: 'Other', email: 'other-med@example.test', password: 'password123' })
  setToken(token)
  await expect(careApi.updateMedication('c_demo', 'med_frank', body)).rejects.toMatchObject({ status: 404 })
  await expect(careApi.deleteMedication('c_demo', 'med_frank')).rejects.toMatchObject({ status: 404 })
})

it('shares taken status between Medications and Home and preserves it after remount', async () => {
  vi.setSystemTime(new Date(2026, 11, 1, 12))
  try {
    await logIn()
    await careApi.createMedication('c_demo', {
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
    const today = await screen.findByRole('region', { name: 'Doses' })
    const takeButton = await within(today).findByRole('button', { name: /^Mark taken: Parity sample/ })
    expect(within(takeButton.closest('li')!).getByText('Overdue')).toBeInTheDocument()
    await user.click(takeButton)
    expect(await within(today).findByRole('button', { name: /^Mark pending: Parity sample/ })).toBeInTheDocument()
    expect(await within(today).findByText(/^Taken on .+ at /)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Overview' }))
    let home = await screen.findByRole('region', { name: 'Today’s medications' })
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
    home = await screen.findByRole('region', { name: 'Today’s medications' })
    await user.click(await within(home).findByRole('button', { name: /^Mark pending: Parity sample/ }))
    await user.click(screen.getByRole('link', { name: 'Medications' }))
    const restoredToday = await screen.findByRole('region', { name: 'Doses' })
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
  const today = await screen.findByRole('region', { name: 'Doses' })
  await user.click(await within(today).findByRole('button', { name: /^Mark taken: Sample medication B/ }))
  expect(await within(today).findByRole('alert')).toHaveTextContent('Dose could not be saved.')
  expect(within(today).getByRole('button', { name: /^Mark taken: Sample medication B/ })).toBeEnabled()
})

it('generates doses once, retains status on refetch, and protects status writes', async () => {
  await logIn()
  const { medication } = await careApi.createMedication('c_demo', {
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
  await careApi.updateMedicationDose('c_demo', doses[0].id, 'completed')
  expect(await load()).toHaveLength(4)
  const recorded = (await load())[0]
  expect(recorded).toMatchObject({ id: doses[0].id, status: 'completed', takenAt: expect.any(String) })
  await careApi.updateMedicationDose('c_demo', doses[0].id, 'completed')
  expect((await load())[0].takenAt).toBe(recorded.takenAt)
  await careApi.updateMedicationDose('c_demo', doses[0].id, 'pending')
  expect((await load())[0]).toMatchObject({ status: 'pending', takenAt: null })
  const { token } = await authApi.register({
    name: 'Outsider',
    email: 'dose-outsider@example.test',
    password: 'password123',
  })
  setToken(token)
  await expect(careApi.updateMedicationDose('c_demo', doses[0].id, 'pending')).rejects.toMatchObject({ status: 404 })
})

it('shows today’s overdue doses on both pages and removes them when taken', async () => {
  vi.setSystemTime(new Date(2026, 11, 2, 12))
  try {
    await logIn()
    await careApi.createMedication('c_demo', {
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
    let overdue = await screen.findByRole('region', { name: 'Overdue doses' })
    expect(within(overdue).getAllByText('Today overdue sample · 1 tablet')).toHaveLength(1)
    expect(within(overdue).getByText('1 overdue dose')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Showing'), 'r_frank')
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Overdue doses' })).not.toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Showing'), '')
    await screen.findByRole('region', { name: 'Overdue doses' })
    await user.click(screen.getByRole('link', { name: 'Medications' }))
    await screen.findByRole('heading', { name: 'Medications', level: 1 })
    overdue = await screen.findByRole('region', { name: 'Attention needed' })
    await user.click(within(overdue).getByRole('button', { name: /^Mark taken: Today overdue sample/ }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Attention needed' })).not.toBeInTheDocument())
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
    await careApi.createMedication('c_demo', {
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
    let previous = await screen.findByRole('region', { name: 'Overdue doses' })
    expect(within(previous).getByText('Overdue from yesterday')).toBeInTheDocument()
    expect(within(previous).getByRole('button', { name: /^Mark taken: Yesterday sample/ })).toBeInTheDocument()
    expect(within(previous).getByText(/Dec 1, 2026/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Showing'), 'r_frank')
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Overdue doses' })).not.toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Showing'), '')
    await screen.findByRole('region', { name: 'Overdue doses' })
    await user.click(screen.getByRole('link', { name: 'Medications' }))
    await screen.findByRole('heading', { name: 'Medications', level: 1 })
    previous = await screen.findByRole('region', { name: 'Attention needed' })
    const dates = dashboardWindow(new Date())
    const loadToday = async () =>
      (await careApi.medicationOccurrences('c_demo', { from: dates.todayStart, to: dates.tomorrowStart }))
        .medicationOccurrences
    const before = await loadToday()
    await user.click(within(previous).getByRole('button', { name: /^Mark taken: Yesterday sample/ }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Attention needed' })).not.toBeInTheDocument())
    expect(await loadToday()).toEqual(before)
    await user.click(screen.getByRole('link', { name: 'Overview' }))
    await screen.findByRole('region', { name: 'Today’s medications' })
    expect(screen.queryByRole('region', { name: 'Overdue doses' })).not.toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

it('keeps older stored pending doses and honors grace periods crossing midnight', async () => {
  vi.setSystemTime(new Date('2026-12-02T00:10:00Z'))
  try {
    await logIn()
    const { medication } = await careApi.createMedication('c_demo', {
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
    const { medication: old } = await careApi.createMedication('c_demo', {
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
    const { medication } = await careApi.createMedication('c_demo', {
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
    const previous = await screen.findByRole('region', { name: 'Attention needed' })
    expect(within(previous).getAllByText('Twice sample · 1 tablet')).toHaveLength(2)
    expect(within(previous).getByText('2 overdue doses')).toBeInTheDocument()
    await user.click(within(previous).getAllByRole('button', { name: /^Mark taken: Twice sample/ })[0])
    expect(await within(previous).findByText('1 overdue dose')).toBeInTheDocument()
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
    await careApi.createMedication('c_demo', {
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
    let reminders = await screen.findByRole('region', { name: 'Dose reminders' })
    expect(within(reminders).getByText('Due in 15 min')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Showing'), 'r_frank')
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Dose reminders' })).not.toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Showing'), '')
    await screen.findByRole('region', { name: 'Dose reminders' })
    await user.click(screen.getByRole('link', { name: 'Medications' }))
    await screen.findByRole('heading', { name: 'Medications', level: 1 })
    reminders = await screen.findByRole('region', { name: 'Attention needed' })
    await user.click(within(reminders).getByRole('button', { name: /^Mark taken: Reminder sample/ }))
    await waitFor(() => expect(within(reminders).queryByText('Reminder sample · 1 tablet')).not.toBeInTheDocument())
    await user.click(screen.getByRole('link', { name: 'Overview' }))
    await screen.findByRole('region', { name: 'Today’s medications' })
    expect(screen.queryByRole('region', { name: 'Dose reminders' })).not.toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})
