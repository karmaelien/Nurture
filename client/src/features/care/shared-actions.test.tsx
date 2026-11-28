import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { authApi } from '../../api/auth.ts'
import { setToken } from '../../api/token.ts'
import { DEMO_ACCOUNT, readDb, writeDb } from '../../mocks/db.ts'
import { renderApp } from '../../test/renderApp.tsx'

import { server } from '../../test/setup.ts'

it.each(['Home', 'Appointments', 'Calendar', 'Appointment warning', 'Home warning', 'Calendar day'])(
  'shows appointment status loading and failures beside the affected item on %s',
  async (surface) => {
    setToken((await authApi.login(DEMO_ACCOUNT)).token)
    let release!: () => void
    let requests = 0
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.patch('/api/circles/:circleId/appointments/:id', async () => {
        requests++
        await waiting
        return HttpResponse.json({ error: { code: 'unavailable', message: 'Status unavailable.' } }, { status: 503 })
      }),
    )
    const db = readDb()
    const appointment = db.care.appointments.find((item) => item.id === 'a_checkup')!
    appointment.startsAt = new Date(Date.now() - 7_200_000).toISOString()
    appointment.endsAt = new Date(Date.now() - 3_600_000).toISOString()
    writeDb(db)
    const user = userEvent.setup()
    renderApp(surface.startsWith('Home') ? '/app' : '/app/appointments')
    let scope: HTMLElement
    if (surface.endsWith('warning')) {
      await user.click(await screen.findByRole('button', { name: '1 overdue appointment' }))
      scope = screen.getByRole('dialog', { name: 'Overdue appointments' })
    } else if (surface === 'Calendar day') {
      const calendar = await screen.findByRole('region', { name: 'Calendar' })
      const date = new Date(appointment.startsAt).toLocaleDateString(undefined, { dateStyle: 'full' })
      await user.click(await within(calendar).findByRole('button', { name: `View appointments for ${date}` }))
      scope = screen.getByRole('dialog', { name: 'Appointments' })
    } else if (surface === 'Calendar') {
      const calendar = await screen.findByRole('region', { name: 'Calendar' })
      await user.click((await within(calendar).findAllByRole('button', { name: /Annual checkup for Rose/ }))[0])
      scope = screen.getByRole('dialog', { name: 'Appointment Details' })
    } else {
      scope = await screen.findByRole('region', { name: surface === 'Home' ? 'Appointments' : 'Upcoming appointments' })
      await within(scope).findByText('Annual checkup')
    }
    const row = within(scope).getByText('Annual checkup').closest('li') ?? scope
    const complete = within(row).getByRole('button', { name: 'Mark completed' })
    try {
      act(() => {
        fireEvent.click(complete)
        fireEvent.click(complete)
      })
      await waitFor(() => expect(requests).toBe(1))
      expect(complete).toBeDisabled()
      expect(within(row).getByRole('button', { name: 'Edit appointment' })).toBeDisabled()
      expect(within(row).getByRole('button', { name: 'Delete appointment' })).toBeDisabled()
      release()
      expect(await within(row).findByRole('alert')).toHaveTextContent(
        'Could not save appointment status. Status unavailable.',
      )
      await waitFor(() => expect(complete).toBeEnabled())
      expect(readDb().care.appointments.find((appointment) => appointment.id === 'a_checkup')?.status).not.toBe(
        'completed',
      )
    } finally {
      release()
    }
  },
)

it('uses the same task row typography and action styles on Home, Tasks, and calendar details', async () => {
  setToken((await authApi.login(DEMO_ACCOUNT)).token)
  const user = userEvent.setup()
  const router = renderApp('/app')
  const home = await screen.findByRole('region', { name: 'Tasks' })
  const heading = await within(home).findByRole('heading', { name: 'Pick up prescription' })
  const headingClasses = heading.className
  const actionClasses = within(heading.closest('li')!).getByRole('button', {
    name: 'Edit task: Pick up prescription',
  }).className
  await act(() => router.navigate('/app/tasks'))
  const tasks = await screen.findByRole('region', { name: 'Task list' })
  const taskHeading = await within(tasks).findByRole('heading', { name: 'Pick up prescription' })
  expect(taskHeading.className).toBe(headingClasses)
  expect(
    within(taskHeading.closest('li')!).getByRole('button', { name: 'Edit task: Pick up prescription' }).className,
  ).toBe(actionClasses)
  const calendar = await screen.findByRole('region', { name: 'Task Calendar' })
  await user.click(await within(calendar).findByRole('button', { name: /Pick up prescription for Rose/ }))
  const popup = within(screen.getByRole('dialog', { name: 'Task Details' }))
  expect(popup.getByRole('heading', { name: 'Pick up prescription' }).className).toBe(headingClasses)
  expect(popup.getByRole('button', { name: 'Edit task: Pick up prescription' }).className).toBe(actionClasses)
})
