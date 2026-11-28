import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'

afterEach(() => vi.useRealTimers())
it.each(['/app', '/app/medications'])(
  'searches medication names and filters saved schedules and lists on %s',
  async (path) => {
    vi.setSystemTime(new Date(2026, 10, 26, 12))
    setToken((await authApi.login(DEMO_ACCOUNT)).token)
    const user = userEvent.setup()
    renderApp(path)
    const list = await screen.findByRole('region', { name: 'Medication List' })
    await within(list).findByRole('heading', { name: 'Sample medication A' })
    const trigger = screen.getByRole('combobox', { name: 'Medication' })
    await user.click(trigger)
    await user.type(screen.getByLabelText('Search medications'), '  MEDICATION A ')
    const choices = screen.getByRole('listbox', { name: 'Medications by name' })
    expect(within(choices).queryByRole('option', { name: /Sample medication B/ })).not.toBeInTheDocument()
    await user.click(within(choices).getByRole('option', { name: /Sample medication A/ }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(within(list).queryByRole('heading', { name: 'Sample medication B' })).not.toBeInTheDocument()
    const schedule = screen.getByRole('region', { name: 'Medication Schedule' })
    expect(await within(schedule).findByText('1 / 2 taken')).toBeInTheDocument()
    expect(within(schedule).queryByText('Sample medication B · 1 tablet')).not.toBeInTheDocument()
    if (path.endsWith('/medications')) {
      const calendar = screen.getByRole('region', { name: 'Medication Calendar' })
      await within(calendar).findByRole('table')
      expect(within(calendar).queryByRole('button', { name: /Sample medication B for/ })).not.toBeInTheDocument()
    }
    await user.click(trigger)
    await user.click(screen.getByRole('option', { name: 'All medications' }))
    expect(within(list).getByRole('heading', { name: 'Sample medication B' })).toBeInTheDocument()
    expect(await within(schedule).findByText('1 / 3 taken')).toBeInTheDocument()
  },
)

it('handles empty name searches, Escape, and clicking away without changing the filter', async () => {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const user = userEvent.setup()
  renderApp('/app/medications')
  await screen.findByRole('region', { name: 'Medication List' })
  const trigger = screen.getByRole('combobox', { name: 'Medication' })
  await user.click(trigger)
  await user.type(screen.getByLabelText('Search medications'), 'no such medicine')
  expect(screen.getByText('No matching medications.')).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await user.click(trigger)
  fireEvent.pointerDown(document.body)
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(trigger).toHaveTextContent('All medications')
})
