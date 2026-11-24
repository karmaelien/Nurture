import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { careApi } from '../../api/care.ts'
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
  it('matches the appointment page at the seven-day boundary', async () => {
    vi.setSystemTime(new Date(2026, 10, 17, 12))
    try {
      await login()
      const db = readDb()
      const boundary = Date.now() + 7 * 86_400_000
      const visit = db.care.appointments[0]
      db.care.appointments.push(
        {
          ...visit,
          id: 'within-window',
          title: 'Seven-day visit',
          startsAt: new Date(boundary).toISOString(),
          endsAt: undefined,
        },
        {
          ...visit,
          id: 'out-of-window',
          title: 'Later visit',
          startsAt: new Date(boundary + 1).toISOString(),
          endsAt: undefined,
        },
      )
      writeDb(db)
      renderApp('/app')
      const home = await screen.findByRole('region', { name: 'Appointments · next 7 days' })
      expect(await within(home).findByText('Seven-day visit')).toBeInTheDocument()
      expect(within(home).queryByText('Later visit')).not.toBeInTheDocument()
      await userEvent.setup().click(within(home).getByRole('link', { name: 'Appointments · next 7 days' }))
      const upcoming = await screen.findByRole('region', { name: 'Upcoming appointments' })
      expect(within(upcoming).getByText('Seven-day visit')).toBeInTheDocument()
      expect(within(upcoming).queryByText('Later visit')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
  it('warns about overdue appointments outside the upcoming window and clears the warning on completion', async () => {
    await login()
    const db = readDb()
    const now = Date.now()
    db.care.appointments.push({
      ...db.care.appointments[0],
      id: 'past-visit',
      title: 'Past checkup',
      startsAt: new Date(now - 48 * 3_600_000).toISOString(),
      endsAt: new Date(now - 47 * 3_600_000).toISOString(),
    })
    writeDb(db)
    const user = userEvent.setup()
    renderApp('/app')
    await screen.findByRole('button', { name: '1 overdue appointment' })
    await user.selectOptions(screen.getByLabelText('Showing'), 'r_frank')
    const filteredPanel = screen.getByRole('region', { name: 'Appointments · next 7 days' })
    await within(filteredPanel).findByText('Physical therapy')
    expect(within(filteredPanel).queryByText('Past checkup')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1 overdue appointment' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Showing'), 'r_rose')
    const warning = await screen.findByRole('button', { name: '1 overdue appointment' })
    const list = screen.getByRole('list', { name: 'Overdue and upcoming appointments' })
    const first = within(list).getAllByRole('listitem')[0]
    expect(within(first).getByText('Past checkup')).toBeInTheDocument()
    expect(within(first).getByText('Overdue')).toBeInTheDocument()
    await user.click(warning)
    const dialog = screen.getByRole('dialog', { name: 'Overdue appointments' })
    expect(within(dialog).getByText('Past checkup')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Mark completed' }))
    expect(await within(dialog).findByText('No overdue appointments.')).toBeInTheDocument()
    expect(warning).not.toBeInTheDocument()
  })
  it('creates, reschedules, and deletes a visit across the calendar and Home', async () => {
    await login()
    const user = userEvent.setup()
    const router = renderApp('/app/appointments')
    await user.click(await screen.findByRole('button', { name: 'Add appointment' }))
    const form = screen.getByRole('dialog', { name: 'Add appointment' })
    const visitDate = new Date()
    visitDate.setDate(visitDate.getDate() + 1)
    const date = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(visitDate)
    await user.type(within(form).getByLabelText('Title'), 'Dental follow-up')
    fireEvent.change(within(form).getByLabelText('Start date'), { target: { value: date } })
    await user.type(within(form).getByLabelText('Start time'), '10')
    await user.type(within(form).getByLabelText('End time'), '09:00')
    await user.click(within(form).getByRole('button', { name: 'Save appointment' }))
    expect(within(form).getByText('End time must be after start time.')).toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('End time'), { target: { value: '11:00' } })
    const save = vi.spyOn(careApi, 'createAppointment')
    try {
      const formElement = within(form).getByRole('button', { name: 'Save appointment' }).closest('form')!
      act(() => {
        fireEvent.submit(formElement)
        fireEvent.submit(formElement)
      })
      expect(save).toHaveBeenCalledTimes(1)
    } finally {
      save.mockRestore()
    }
    const upcoming = screen.getByRole('region', { name: 'Upcoming appointments' })
    const created = (await within(upcoming).findByText('Dental follow-up')).closest('li')!
    await waitFor(() => expect(form).not.toBeInTheDocument())

    await user.click(within(created).getByRole('button', { name: 'Edit appointment' }))
    const editor = screen.getByRole('dialog', { name: 'Edit appointment' })
    expect(within(editor).getByLabelText('Start date')).toHaveValue(date)
    expect(within(editor).getByLabelText('Start time')).toHaveValue('10:00')
    expect(within(editor).getByLabelText('Start AM/PM')).toHaveValue('AM')
    fireEvent.change(within(editor).getByLabelText('Start time'), { target: { value: '12:00' } })
    await user.selectOptions(within(editor).getByLabelText('Start AM/PM'), 'PM')
    fireEvent.change(within(editor).getByLabelText('End time'), { target: { value: '1:00' } })
    await user.selectOptions(within(editor).getByLabelText('End AM/PM'), 'PM')
    await user.click(within(editor).getByRole('button', { name: 'Save appointment' }))
    await waitFor(() => expect(editor).not.toBeInTheDocument())
    expect(readDb().care.appointments.find((item) => item.title === 'Dental follow-up')?.startsAt).toBe(
      new Date(`${date}T12:00`).toISOString(),
    )

    await user.click(screen.getByRole('link', { name: 'Overview' }))
    const home = await screen.findByRole('region', { name: 'Appointments · next 7 days' })
    const homeEntry = (await within(home).findByText('Dental follow-up')).closest('li')!
    await user.click(within(homeEntry).getByRole('button', { name: 'Edit appointment' }))
    const homeEditor = screen.getByRole('dialog', { name: 'Edit appointment' })
    expect(within(homeEditor).getByLabelText('Start AM/PM')).toHaveValue('PM')
    await user.type(within(homeEditor).getByLabelText(/^Location/), 'Dental clinic')
    await user.click(within(homeEditor).getByRole('button', { name: 'Save appointment' }))
    expect(await within(homeEntry).findByRole('link', { name: /Dental clinic/ })).toBeInTheDocument()
    await waitFor(() => expect(homeEditor).not.toBeInTheDocument())
    await user.click(within(home).getByRole('link', { name: 'Appointments · next 7 days' }))
    expect(router.state.location.pathname).toBe('/app/appointments')
    const list = await screen.findByRole('region', { name: 'Upcoming appointments' })
    const entry = (await within(list).findByText('Dental follow-up')).closest('li')!
    expect(within(entry).getByRole('link', { name: /Dental clinic/ })).toBeInTheDocument()
    await user.click(within(entry).getByRole('button', { name: 'Edit appointment' }))
    const edit = screen.getByRole('dialog', { name: 'Edit appointment' })
    await user.click(within(edit).getByRole('button', { name: 'Delete appointment' }))
    const confirmation = screen.getByRole('dialog', { name: 'Delete appointment?' })
    expect(readDb().care.appointments.some((item) => item.title === 'Dental follow-up')).toBe(true)
    await user.click(within(confirmation).getByRole('button', { name: 'Delete appointment' }))
    await waitFor(() => expect(within(list).queryByText('Dental follow-up')).not.toBeInTheDocument())
    await user.click(screen.getByRole('link', { name: 'Overview' }))
    const refreshedHome = await screen.findByRole('region', { name: 'Appointments · next 7 days' })
    await within(refreshedHome).findByText('Annual checkup')
    expect(within(refreshedHome).queryByText('Dental follow-up')).not.toBeInTheDocument()
  })
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
    expect(await within(entry).findByRole('button', { name: 'Mark as to do' })).toBeInTheDocument()
    expect(within(entry).getByRole('img', { name: 'Completed' })).toBeInTheDocument()
    expect(within(panel).getAllByRole('listitem').at(-1)).toBe(entry)
    expect(screen.getByText('Upcoming appointments · next 7 days').parentElement).toHaveTextContent(/2$/)
    await user.click(within(panel).getByRole('link', { name: 'Appointments · next 7 days' }))
    const upcoming = await screen.findByRole('region', { name: 'Upcoming appointments' })
    const calendarEntry = within(upcoming).getByText('Annual checkup').closest('li')!
    expect(within(calendarEntry).getByRole('img', { name: 'Completed' })).toBeInTheDocument()
    await user.click(within(calendarEntry).getByRole('button', { name: 'Mark as to do' }))
    expect(await within(calendarEntry).findByRole('button', { name: 'Mark completed' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Overview' }))
    const homePanel = await screen.findByRole('region', { name: 'Appointments · next 7 days' })
    const restoredEntry = (await within(homePanel).findByText('Annual checkup')).closest('li')!
    expect(within(restoredEntry).getByRole('button', { name: 'Mark completed' })).toBeInTheDocument()
    expect(within(restoredEntry).queryByRole('img', { name: 'Completed' })).not.toBeInTheDocument()
    expect(within(homePanel).getAllByRole('listitem')[0]).toBe(restoredEntry)
    expect(screen.getByText('Upcoming appointments · next 7 days').parentElement).toHaveTextContent(/3$/)

    // Simulate a newer saved change while this app session is still open.
    const saved = readDb().care.appointments.find((appointment) => appointment.title === 'Annual checkup')!
    await careApi.updateAppointmentStatus('c_demo', saved.id, 'completed')
    await user.click(within(homePanel).getByRole('link', { name: 'Appointments · next 7 days' }))
    const refreshed = await screen.findByRole('region', { name: 'Upcoming appointments' })
    await waitFor(() => {
      const checkup = within(refreshed).getByText('Annual checkup').closest('li')!
      expect(within(checkup).getByRole('img', { name: 'Completed' })).toBeInTheDocument()
    })
  })

  it('reloads saved completion from the mock database on a fresh app mount', async () => {
    const user = userEvent.setup()
    await login()
    renderApp('/app')
    const panel = await screen.findByRole('region', { name: 'Appointments · next 7 days' })
    const entry = (await within(panel).findByText('Annual checkup')).closest('li')!
    await user.click(within(entry).getByRole('button', { name: 'Mark completed' }))
    await within(entry).findByRole('img', { name: 'Completed' })

    cleanup()
    renderApp('/app/appointments')
    const upcoming = await screen.findByRole('region', { name: 'Upcoming appointments' })
    const completed = within(upcoming).getByText('Annual checkup').closest('li')!
    expect(within(completed).getByRole('img', { name: 'Completed' })).toBeInTheDocument()
    await user.click(within(completed).getByRole('button', { name: 'Mark as to do' }))
    await within(completed).findByRole('button', { name: 'Mark completed' })

    cleanup()
    renderApp('/app')
    const restoredPanel = await screen.findByRole('region', { name: 'Appointments · next 7 days' })
    const restored = (await within(restoredPanel).findByText('Annual checkup')).closest('li')!
    expect(within(restored).getByRole('button', { name: 'Mark completed' })).toBeInTheDocument()
  })
  it('keeps the shared navigation between home and appointments with the correct active link', async () => {
    const user = userEvent.setup()
    await login()
    const router = renderApp('/app')
    await screen.findByRole('heading', { name: 'A little clarity for your day.' })
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    const homeAppointments = screen.getByRole('region', { name: 'Appointments · next 7 days' })
    expect(await within(homeAppointments).findByText('Annual checkup')).toBeInTheDocument()
    await user.click(within(navigation).getByRole('link', { name: 'Appointments' }))
    await screen.findByRole('heading', { name: 'Appointments', level: 1 })
    const upcoming = screen.getByRole('region', { name: 'Upcoming appointments' })
    expect(within(upcoming).getByText('Annual checkup')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/app/appointments')
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBe(navigation)
    expect(within(navigation).getByRole('link', { name: 'Appointments' })).toHaveAttribute('aria-current', 'page')
    expect(within(navigation).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
    const circleId = new URLSearchParams(router.state.location.search).get('circleId')
    expect(circleId).toBeTruthy()
    expect(within(navigation).getByRole('link', { name: 'Tasks' })).toHaveAttribute(
      'href',
      `/app?circleId=${circleId}#tasks`,
    )
    expect(within(navigation).getByRole('link', { name: 'Expenses' })).toHaveAttribute(
      'href',
      `/app/expenses?circleId=${circleId}`,
    )
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
