import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'

afterEach(() => vi.useRealTimers())
async function login() {
  vi.setSystemTime(new Date(2026, 10, 26, 12))
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
}

it.each([
  ['/app/appointments', 'Calendar', 'appointments', 'Add appointment', 'Start date'],
  ['/app/medications', 'Medication Calendar', 'medications', 'Add medication', 'Start date'],
  ['/app/tasks', 'Task Calendar', 'tasks', 'Add task', 'Due date (optional)'],
])(
  'shares navigation, empty date selection, and date-prefilled creation on %s',
  async (path, region, noun, add, dateLabel) => {
    await login()
    const user = userEvent.setup()
    renderApp(path)
    const calendar = await screen.findByRole('region', { name: region })
    await within(calendar).findByRole('table')
    const picker = within(calendar).getByLabelText('Calendar date')
    fireEvent.change(picker, { target: { value: '2020-01-31' } })
    await within(calendar).findByRole('table')
    await user.click(within(calendar).getByRole('button', { name: 'Next month' }))
    expect(picker).toHaveValue('2020-02-29')
    await user.click(within(calendar).getByRole('button', { name: 'Next month' }))
    expect(picker).toHaveValue('2020-03-31')
    await user.click(within(calendar).getByRole('button', { name: 'Today' }))
    expect(picker).toHaveValue('2026-11-26')
    await user.click(within(calendar).getByRole('button', { name: 'Daily' }))
    await user.click(within(calendar).getByRole('button', { name: 'Next day' }))
    expect(picker).toHaveValue('2026-11-27')
    await user.click(within(calendar).getByRole('button', { name: 'Weekly' }))
    await user.click(within(calendar).getByRole('button', { name: 'Previous week' }))
    expect(picker).toHaveValue('2026-11-20')
    await user.click(within(calendar).getByRole('button', { name: 'Monthly' }))
    fireEvent.change(picker, { target: { value: '2020-01-15' } })
    const date = new Date(2020, 0, 15).toLocaleDateString(undefined, { dateStyle: 'full' })
    await user.click(await within(calendar).findByRole('button', { name: `View ${noun} for ${date}` }))
    let popup = screen.getByRole('dialog')
    fireEvent.click(popup, { clientX: -10, clientY: -10 })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(within(calendar).getByRole('button', { name: `View ${noun} for ${date}` }))
    popup = screen.getByRole('dialog')
    const action = within(popup).getByRole('button', { name: add })
    await waitFor(() => expect(action).toBeEnabled())
    await user.click(action)
    expect(popup).not.toHaveAttribute('open')
    const editor = screen.getByRole('dialog')
    expect(within(editor).getByLabelText(dateLabel)).toHaveValue('2020-01-15')
    await user.click(within(editor).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  },
)

it('deletes an appointment directly from calendar details with a confirmation', async () => {
  await login()
  const user = userEvent.setup()
  renderApp('/app/appointments')
  const calendar = await screen.findByRole('region', { name: 'Calendar' })
  await user.click(await within(calendar).findByRole('button', { name: /Annual checkup for Rose/ }))
  const popup = screen.getByRole('dialog')
  await user.click(within(popup).getByRole('button', { name: 'Delete appointment' }))
  expect(popup).not.toHaveAttribute('open')
  let confirmation = screen.getByRole('dialog', { name: 'Delete appointment?' })
  fireEvent.click(confirmation, { clientX: -10, clientY: -10 })
  expect(readDb().care.appointments.some((item) => item.id === 'a_checkup')).toBe(true)
  await user.click(within(calendar).getByRole('button', { name: /Annual checkup for Rose/ }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete appointment' }))
  confirmation = screen.getByRole('dialog', { name: 'Delete appointment?' })
  await user.click(within(confirmation).getByRole('button', { name: 'Delete appointment' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(readDb().care.appointments.some((item) => item.id === 'a_checkup')).toBe(false)
  expect(within(calendar).queryByRole('button', { name: /Annual checkup for Rose/ })).not.toBeInTheDocument()
})

it('deletes medication through calendar confirmation and refreshes its doses', async () => {
  await login()
  const user = userEvent.setup()
  renderApp('/app/medications')
  const calendar = await screen.findByRole('region', { name: 'Medication Calendar' })
  await user.click((await within(calendar).findAllByRole('button', { name: /Sample medication A for Rose/ }))[0])
  const popup = screen.getByRole('dialog')
  await user.click(await within(popup).findByRole('button', { name: 'Delete medication' }))
  expect(popup).not.toHaveAttribute('open')
  const confirmation = screen.getByRole('dialog', { name: 'Delete Permanently' })
  expect(within(confirmation).getByText(/all its doses, including taken dose history/)).toBeInTheDocument()
  await user.click(within(confirmation).getByRole('button', { name: 'Confirm delete' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(readDb().care.medications.some((item) => item.id === 'med_rose')).toBe(false)
  expect(within(calendar).queryByRole('button', { name: /Sample medication A for Rose/ })).not.toBeInTheDocument()
})
