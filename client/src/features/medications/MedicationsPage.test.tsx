import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { setToken } from '../../api/token.ts'
import type { MedicationInput } from '../../api/types.ts'
import { DEMO_ACCOUNT } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'

async function logIn() {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
}

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
