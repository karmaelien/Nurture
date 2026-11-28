import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
import { ApiError } from '../../api/client.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { createTrackedMedication } from '../../test/medication-fixtures.ts'
import { renderApp } from '../../test/renderApp.tsx'

afterEach(() => vi.useRealTimers())

async function open(date = new Date(2026, 10, 25, 12), times = ['08:00', '09:00', '10:00', '11:00']) {
  vi.setSystemTime(date)
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const db = readDb()
  db.care.medications = []
  db.care.medicationOccurrences = []
  writeDb(db)
  await createTrackedMedication('c_demo', {
    recipientId: 'r_rose',
    name: 'Calendar medicine',
    dosage: '1 tablet',
    assignedCaregiverId: null,
    schedule: {
      times,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startsOn: '2026-11-25',
      end: { kind: 'afterDays', days: 1 },
    },
  })
  renderApp('/app/medications')
  const calendar = await screen.findByRole('region', { name: 'Medication Calendar' })
  await within(calendar).findByRole('table')
  return { calendar, user: userEvent.setup() }
}

it('shows compact month doses, expands overflow, saves taken status, and closes on click-away', async () => {
  const { calendar, user } = await open()
  const buttons = within(calendar).getAllByRole('button', { name: /Calendar medicine for Rose/ })
  expect(buttons).toHaveLength(3)
  await user.click(within(calendar).getByRole('button', { name: /Show all doses/ }))
  const dialog = screen.getByRole('dialog', { name: 'Scheduled Doses' })
  expect(within(dialog).getAllByRole('button', { name: /^Mark taken:/ })).toHaveLength(4)
  await user.click(within(dialog).getAllByRole('button', { name: /^Mark taken:/ })[0])
  await within(dialog).findByRole('button', { name: /^Mark pending:/ })
  expect(within(calendar).getByRole('button', { name: /Calendar medicine for Rose.*Taken/ })).toHaveClass(
    'line-through',
  )
  expect(readDb().care.medicationOccurrences.filter((dose) => dose.status === 'completed')).toHaveLength(1)
  fireEvent.click(dialog, { clientX: -10, clientY: -10 })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('switches to hourly day/week views and applies the selected profile', async () => {
  const { calendar, user } = await open()
  await user.click(within(calendar).getByRole('button', { name: 'Daily' }))
  await within(calendar).findByRole('columnheader', { name: 'Time' })
  expect(within(calendar).getAllByRole('button', { name: /Calendar medicine for Rose/ })).toHaveLength(4)
  expect(within(calendar).getAllByRole('rowheader')).toHaveLength(24)
  await user.click(within(calendar).getByRole('button', { name: 'Next day' }))
  await within(calendar).findByText('No doses scheduled this day.')
  await user.click(within(calendar).getByRole('button', { name: 'Weekly' }))
  await waitFor(() =>
    expect(within(calendar).getAllByRole('button', { name: /Calendar medicine for Rose/ })).toHaveLength(4),
  )
  await user.selectOptions(screen.getByLabelText('Showing'), 'r_frank')
  const filtered = screen.getByRole('region', { name: 'Medication Calendar' })
  await within(filtered).findByText('No doses scheduled this week.')
  expect(within(filtered).queryByRole('button', { name: /Calendar medicine for Rose/ })).not.toBeInTheDocument()
})

it('handles weeks crossing a year boundary and month navigation', async () => {
  const { calendar, user } = await open(new Date(2027, 0, 1, 12))
  await user.click(within(calendar).getByRole('button', { name: 'Weekly' }))
  await within(calendar).findByRole('columnheader', { name: /Dec 27/ })
  expect(within(calendar).getByRole('columnheader', { name: /Jan 2/ })).toBeInTheDocument()
  await user.click(within(calendar).getByRole('button', { name: 'Monthly' }))
  await user.click(within(calendar).getByRole('button', { name: 'Next month' }))
  await within(calendar).findByRole('heading', { name: 'February 2027' })
  await user.click(within(calendar).getByRole('button', { name: 'Previous month' }))
  await within(calendar).findByRole('heading', { name: 'January 2027' })
})

it('limits hourly overflow to that hour rather than including other doses that day', async () => {
  const { calendar, user } = await open(undefined, ['08:00', '08:10', '08:20', '08:30', '09:00'])
  await user.click(within(calendar).getByRole('button', { name: 'Daily' }))
  await user.click(await within(calendar).findByRole('button', { name: /Show all doses at / }))
  const dialog = screen.getByRole('dialog', { name: 'Scheduled Doses' })
  expect(within(dialog).getAllByRole('button', { name: /^Mark taken:/ })).toHaveLength(4)
  expect(within(dialog).queryByRole('button', { name: /9:00/ })).not.toBeInTheDocument()
})

it('closes stale dose controls when a deleted medication is detected', async () => {
  const { calendar, user } = await open()
  await user.click(within(calendar).getAllByRole('button', { name: /Calendar medicine for Rose/ })[0])
  const dialog = screen.getByRole('dialog', { name: 'Dose Details' })
  const medication = readDb().care.medications[0]
  await careApi.deleteMedication('c_demo', medication.id, medication.version)
  await user.click(within(dialog).getByRole('button', { name: /^Mark taken:/ }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await within(calendar).findByText('No doses scheduled this month.')
})

it('retries a 502 calendar error and restores the requested period', async () => {
  const { calendar, user } = await open()
  const load = vi
    .spyOn(careApi, 'medicationOccurrences')
    .mockRejectedValueOnce(new ApiError(502, 'unknown_error', 'Gateway error (502).'))
  try {
    await user.click(within(calendar).getByRole('button', { name: 'Next month' }))
    expect(await within(calendar).findByRole('alert')).toHaveTextContent('502')
    load.mockRestore()
    await user.click(within(calendar).getByRole('button', { name: 'Retry calendar' }))
    await within(calendar).findByRole('table', { name: 'December 2026 medication doses' })
    expect(within(calendar).queryByRole('alert')).not.toBeInTheDocument()
  } finally {
    load.mockRestore()
  }
})

it.each(['Monthly', 'Weekly', 'Daily'])('opens a scoped medication list from a date in %s view', async (view) => {
  const { calendar, user } = await open()
  await user.click(within(calendar).getByRole('button', { name: view }))
  const date = new Date(2026, 10, 25).toLocaleDateString(undefined, { dateStyle: 'full' })
  const day = await within(calendar).findByRole('button', { name: `View medications for ${date}` })
  day.focus()
  await user.keyboard('{Enter}')
  const dialog = screen.getByRole('dialog', { name: 'Medications' })
  expect(within(dialog).getByText(`${date} · All care profiles`)).toBeInTheDocument()
  expect(within(dialog).getAllByRole('button', { name: /^Mark taken:/ })).toHaveLength(4)
  await user.click(within(dialog).getAllByRole('button', { name: /^Mark taken:/ })[0])
  await within(dialog).findByRole('button', { name: /^Mark pending:/ })
  fireEvent.click(dialog, { clientX: -10, clientY: -10 })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('opens empty dates and respects the profile filter in date popups', async () => {
  const { calendar, user } = await open()
  const emptyDate = new Date(2026, 10, 26).toLocaleDateString(undefined, { dateStyle: 'full' })
  await user.click(within(calendar).getByRole('button', { name: `View medications for ${emptyDate}` }))
  let dialog = screen.getByRole('dialog', { name: 'Medications' })
  expect(within(dialog).getByText('No medications scheduled for this date.')).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Close' }))
  await user.selectOptions(screen.getByLabelText('Showing'), 'r_frank')
  await within(calendar).findByText('No doses scheduled this month.')
  const doseDate = new Date(2026, 10, 25).toLocaleDateString(undefined, { dateStyle: 'full' })
  await user.click(within(calendar).getByRole('button', { name: `View medications for ${doseDate}` }))
  dialog = screen.getByRole('dialog', { name: 'Medications' })
  expect(within(dialog).getByText(`${doseDate} · Frank Alvarez`)).toBeInTheDocument()
  expect(within(dialog).getByText('No medications scheduled for this date.')).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: /^Mark taken:/ })).not.toBeInTheDocument()
})

it('adds a medication from an empty calendar date with the date and profile prefilled', async () => {
  const { calendar, user } = await open()
  await user.selectOptions(screen.getByLabelText('Showing'), 'r_frank')
  await within(calendar).findByText('No doses scheduled this month.')
  const date = new Date(2026, 10, 26).toLocaleDateString(undefined, { dateStyle: 'full' })
  await user.click(within(calendar).getByRole('button', { name: `View medications for ${date}` }))
  const popup = screen.getByRole('dialog', { name: 'Medications' })
  await user.click(await within(popup).findByRole('button', { name: 'Add medication' }))
  const editor = screen.getByRole('dialog', { name: 'Add Medication' })
  expect(popup).not.toHaveAttribute('open')
  expect(within(editor).getByLabelText('Start date')).toHaveValue('2026-11-26')
  expect(within(editor).getByLabelText('Care profile')).toHaveValue('r_frank')
  await user.type(within(editor).getByLabelText('Medication name'), 'Calendar addition')
  await user.type(within(editor).getByLabelText('Dosage'), '1 tablet')
  await user.type(within(editor).getByLabelText('Dose time 1'), '9')
  await user.click(within(editor).getByRole('button', { name: 'Save medication' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(readDb().care.medications.find((medication) => medication.name === 'Calendar addition')).toMatchObject({
    recipientId: 'r_frank',
    schedule: { startsOn: '2026-11-26' },
  })
  expect(
    (await within(calendar).findAllByRole('button', { name: /Calendar addition for Frank/ })).length,
  ).toBeGreaterThan(0)
})

it('edits the current medication from a dose without offering permanent deletion', async () => {
  const { calendar, user } = await open()
  await user.click(within(calendar).getAllByRole('button', { name: /Calendar medicine for Rose/ })[0])
  const popup = screen.getByRole('dialog', { name: 'Dose Details' })
  await user.click(await within(popup).findByRole('button', { name: 'Edit medication' }))
  const editor = screen.getByRole('dialog', { name: 'Edit Medication' })
  expect(popup).not.toHaveAttribute('open')
  expect(within(editor).getByLabelText('Medication name')).toHaveValue('Calendar medicine')
  expect(within(editor).getByLabelText('Start date')).toHaveValue('2026-11-25')
  expect(within(editor).queryByRole('button', { name: 'Delete permanently' })).not.toBeInTheDocument()
  await user.clear(within(editor).getByLabelText('Dosage'))
  await user.type(within(editor).getByLabelText('Dosage'), '2 tablets')
  await user.click(within(editor).getByRole('button', { name: 'Save medication' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(readDb().care.medications[0]).toMatchObject({ dosage: '2 tablets', version: 2 })
})

it('retains stopped medication history without offering an edit action', async () => {
  const { calendar, user } = await open()
  const medication = readDb().care.medications[0]
  await careApi.stopMedication('c_demo', medication.id, medication.version)
  // Reload the definitions through navigation, as another tab's saved stop would be observed.
  await user.click(screen.getByRole('link', { name: 'Overview' }))
  await screen.findByRole('heading', { name: 'Overview' })
  await user.click(screen.getByRole('link', { name: 'Medications' }))
  await screen.findByRole('heading', { name: 'Medications', level: 1 })
  await within(screen.getByRole('region', { name: 'Medication List' })).findByText(/^Stopped on /)
  const refreshed = screen.getByRole('region', { name: 'Medication Calendar' })
  await user.click((await within(refreshed).findAllByRole('button', { name: /Calendar medicine for Rose/ }))[0])
  const popup = screen.getByRole('dialog', { name: 'Dose Details' })
  expect(within(popup).queryByRole('button', { name: 'Edit medication' })).not.toBeInTheDocument()
  expect(calendar).not.toBeInTheDocument()
})
