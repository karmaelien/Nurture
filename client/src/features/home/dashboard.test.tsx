import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'
import { server } from '../../test/setup.ts'
import { dashboardWindow } from './dashboard.ts'

async function login() {
  const { token } = await authApi.login(DEMO_ACCOUNT)
  setToken(token)
}

describe('dashboard', () => {
  it('toggles home appointment completion inline and links locations to Maps', async () => {
    const user = userEvent.setup()
    await login()
    renderApp('/app')
    const panel = await screen.findByRole('region', { name: 'Appointments · next 7 days' })
    const entry = (await within(panel).findByText('Annual checkup')).closest('li')!
    expect(within(panel).getByRole('list', { name: 'Appointments in the next 7 days' })).toHaveClass(
      'overflow-y-auto',
      'max-h-[26rem]',
    )
    expect(within(entry).getByRole('link', { name: 'Location: Family clinic' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Family%20clinic',
    )
    await user.click(within(entry).getByText('Annual checkup'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(within(entry).getByRole('button', { name: 'Mark completed' }))
    expect(within(entry).getByText('Annual checkup')).not.toHaveClass('line-through')
    expect(within(entry).getByRole('button', { name: 'Mark as to do' })).toBeInTheDocument()
    expect(within(entry).getByRole('img', { name: 'Completed' })).toBeInTheDocument()
    expect(within(panel).getAllByRole('listitem').at(-1)).toBe(entry)
    expect(screen.getByText('Upcoming appointments · next 7 days').parentElement).toHaveTextContent(/2$/)
    await user.click(within(entry).getByRole('button', { name: 'Mark as to do' }))
    expect(within(entry).getByRole('button', { name: 'Mark completed' })).toBeInTheDocument()
    expect(within(entry).queryByRole('img', { name: 'Completed' })).not.toBeInTheDocument()
    expect(within(panel).getAllByRole('listitem')[0]).toBe(entry)
    expect(screen.getByText('Upcoming appointments · next 7 days').parentElement).toHaveTextContent(/3$/)
  })
  it('keeps the shared navigation between home and appointments with the correct active link', async () => {
    const user = userEvent.setup()
    await login()
    const router = renderApp('/app')
    await screen.findByRole('heading', { name: 'A little clarity for your day.' })
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    await user.click(within(navigation).getByRole('link', { name: 'Appointments' }))
    await screen.findByRole('heading', { name: 'Appointments', level: 1 })
    expect(router.state.location.pathname).toBe('/app/appointments')
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBe(navigation)
    expect(within(navigation).getByRole('link', { name: 'Appointments' })).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
    expect(within(navigation).getByRole('link', { name: 'Care' })).toHaveAttribute('href', '/app#tasks')
    expect(within(navigation).getByRole('link', { name: 'Expenses' })).toHaveAttribute('href', '/app#expenses')
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
    await user.click(within(navigation).getByRole('link', { name: 'Overview' }))
    await screen.findByRole('heading', { name: 'A little clarity for your day.' })
    expect(router.state.location.pathname).toBe('/app')
    expect(within(navigation).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
  })
  it('shows real mock totals and filters every section by recipient', async () => {
    await login()
    renderApp('/app')
    expect(await screen.findByText('$270.50')).toBeInTheDocument()
    expect(await screen.findByText('Grocery delivery')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Showing'), { target: { value: 'r_frank' } })
    expect(await screen.findByText('$103.00')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Pick up prescription')).not.toBeInTheDocument())
    const medications = screen.getByRole('region', { name: 'Today’s medications' })
    expect(await within(medications).findByText('Sample medication B · 1 tablet')).toBeInTheDocument()
    expect(within(medications).queryByText('Sample medication A · 1 tablet')).not.toBeInTheDocument()
  })

  it('shows an independent expense error and lets the user retry', async () => {
    await login()
    server.use(
      http.get('/api/circles/:circleId/expenses', () =>
        HttpResponse.json({ error: { code: 'unavailable', message: 'Spending is unavailable.' } }, { status: 503 }),
      ),
    )
    renderApp('/app')
    expect(await screen.findByText('Spending is unavailable.')).toBeInTheDocument()
    expect(await screen.findByText('Grocery delivery')).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
    server.resetHandlers()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('$270.50')).toBeInTheDocument()
  })

  it('resets recipient selection when changing circles and displays empty states', async () => {
    await login()
    const db = readDb()
    db.circles.push({ ...db.circles[0], id: 'c_empty', name: 'Second circle', recipients: [] })
    writeDb(db)
    renderApp('/app')
    await screen.findByText('$270.50')
    fireEvent.change(screen.getByLabelText('Showing'), { target: { value: 'r_rose' } })
    fireEvent.change(screen.getByLabelText('Care circle'), { target: { value: 'c_empty' } })
    await waitFor(() => expect(screen.getAllByText('Nothing to show for this period.')).toHaveLength(4))
    expect(screen.getByLabelText('Showing')).toHaveValue('')
    expect(screen.queryByText('Pick up prescription')).not.toBeInTheDocument()
  })

  it('uses calendar midnight boundaries and a month-to-date date range', () => {
    const result = dashboardWindow(new Date(2026, 10, 1, 12))
    expect(result.todayStart).toBe(new Date(2026, 10, 1).toISOString())
    expect(result.tomorrowStart).toBe(new Date(2026, 10, 2).toISOString())
    expect(result.to).toBe(new Date(2026, 10, 8).toISOString())
    expect(result.fromDate).toBe('2026-11-01')
    expect(result.toDate).toBe('2026-11-02')
  })
})
