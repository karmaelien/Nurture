import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'

async function open() {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  renderApp('/app')
  return userEvent.setup()
}

it('gives every Home feature a linked header and one Add action', async () => {
  await open()
  for (const [title, path, add] of [
    ['Tasks', 'tasks', 'Add task'],
    ['Appointments', 'appointments', 'Add appointment'],
    ['Expenses', 'expenses', 'Add expense'],
    ['Medications', 'medications', 'Add medication'],
  ]) {
    const panel = await screen.findByRole('region', { name: title })
    expect(within(panel).getByRole('link', { name: `View ${title.toLowerCase()}` })).toHaveAttribute(
      'href',
      `/app/${path}?circleId=c_demo`,
    )
    expect(within(panel).getAllByRole('button', { name: add })).toHaveLength(1)
    await waitFor(() => expect(within(panel).getByRole('button', { name: add })).toBeEnabled())
  }
  expect(screen.queryByRole('link', { name: 'View all expenses' })).not.toBeInTheDocument()
})

it.each([
  ['Tasks', 'Add task', 'Add task', 'Care profile'],
  ['Appointments', 'Add appointment', 'Add appointment', 'Care profile'],
  ['Expenses', 'Add expense', 'Add expense', 'Care profile'],
  ['Medications', 'Add medication', 'Add medication', 'Care profile'],
])(
  'opens the existing %s creation form from Home with the selected person',
  async (title, add, dialogTitle, profileLabel) => {
    const user = await open()
    await user.selectOptions(await screen.findByLabelText('Care profile'), 'r_frank')
    const panel = await screen.findByRole('region', { name: title })
    const action = within(panel).getByRole('button', { name: add })
    await waitFor(() => expect(action).toBeEnabled())
    await user.click(action)
    const dialog = screen.getByRole('dialog', { name: dialogTitle })
    expect(within(dialog).getByLabelText(profileLabel)).toHaveValue('r_frank')
    fireEvent.click(dialog, { clientX: -10, clientY: -10 })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  },
)

it('creates an appointment and expense from Home and refreshes its summaries', async () => {
  const user = await open()
  const appointments = await screen.findByRole('region', { name: 'Appointments' })
  const add = within(appointments).getByRole('button', { name: 'Add appointment' })
  await waitFor(() => expect(add).toBeEnabled())
  await user.click(add)
  let dialog = screen.getByRole('dialog', { name: 'Add appointment' })
  await user.type(within(dialog).getByLabelText('Title'), 'Home creation visit')
  const date = new Date()
  date.setDate(date.getDate() + 1)
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  fireEvent.change(within(dialog).getByLabelText('Start date'), { target: { value: dateKey } })
  await user.type(within(dialog).getByLabelText('Start time'), '10')
  await user.type(within(dialog).getByLabelText('End time'), '11')
  await user.click(within(dialog).getByRole('button', { name: 'Save appointment' }))
  expect(await within(appointments).findByText('Home creation visit')).toBeInTheDocument()
  const expenses = screen.getByRole('region', { name: 'Expenses' })
  await user.click(within(expenses).getByRole('button', { name: 'Add expense' }))
  dialog = screen.getByRole('dialog', { name: 'Add expense' })
  await user.type(within(dialog).getByLabelText('Description'), 'Home creation expense')
  await user.type(within(dialog).getByLabelText('Amount (USD)'), '12.50')
  await user.click(within(dialog).getByRole('button', { name: 'Save expense' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(readDb().care.expenses.find((item) => item.description === 'Home creation expense')).toMatchObject({
    amountCents: 1250,
  })
  expect(readDb().care.appointments.some((item) => item.title === 'Home creation visit')).toBe(true)
})
