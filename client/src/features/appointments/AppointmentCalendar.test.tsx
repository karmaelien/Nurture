import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppointmentCalendar } from './AppointmentCalendar.tsx'
import { AppointmentsPage } from './AppointmentsPage.tsx'
import type { AppointmentSummary, CareProfile } from './AppointmentsPage.tsx'

// jsdom does not implement these native browser dialog methods.
const dialogMethods = ['showModal', 'close'] as const
const originalDialogMethods = dialogMethods.map((method) =>
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, method),
)
beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '')
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open')
        this.dispatchEvent(new Event('close'))
      },
    },
  })
})
afterAll(() => {
  dialogMethods.forEach((method, index) => {
    const original = originalDialogMethods[index]
    if (original) Object.defineProperty(HTMLDialogElement.prototype, method, original)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, method)
  })
})

const profiles: CareProfile[] = [
  { id: 'rose', circleId: 'family', name: 'Rose', circleName: 'Family' },
  { id: 'frank', circleId: 'family', name: 'Frank', circleName: 'Family' },
]
const now = new Date(2026, 11, 15, 12).getTime()
const appointments: AppointmentSummary[] = [
  {
    id: 'rose-visit',
    circleId: 'family',
    recipientId: 'rose',
    title: 'Rose checkup',
    startsAt: new Date(2026, 11, 30, 10).toISOString(),
    endsAt: new Date(2026, 11, 30, 11).toISOString(),
    status: 'scheduled',
  },
  {
    id: 'frank-visit',
    circleId: 'family',
    recipientId: 'frank',
    title: 'Frank checkup',
    startsAt: new Date(2026, 11, 30, 11).toISOString(),
    endsAt: new Date(2026, 11, 30, 12).toISOString(),
    status: 'scheduled',
  },
  {
    id: 'january-visit',
    circleId: 'family',
    recipientId: 'rose',
    title: 'January checkup',
    startsAt: new Date(2027, 0, 5, 9).toISOString(),
    endsAt: new Date(2027, 0, 5, 10).toISOString(),
    status: 'scheduled',
  },
]

describe('appointment calendar', () => {
  it.each(['today', 'upcoming', 'calendar'] as const)(
    'completes and restores an appointment from %s across every view',
    async (source) => {
      const user = userEvent.setup()
      const start = new Date()
      start.setHours(23, 59, 59, 999)
      render(
        <AppointmentsPage
          careProfiles={profiles}
          appointments={[
            {
              ...appointments[0],
              startsAt: start.toISOString(),
              endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
            },
          ]}
        />,
      )
      expect(screen.getByText('Total upcoming appointments').parentElement).toHaveTextContent(/1$/)
      if (source === 'today') {
        await user.click(screen.getByRole('button', { name: /You have 1 scheduled appointment today/ }))
        await user.click(
          within(screen.getByRole('dialog', { name: 'Today’s appointments' })).getByRole('button', {
            name: /Rose checkup/,
          }),
        )
      } else if (source === 'upcoming') {
        await user.click(
          within(screen.getByRole('region', { name: 'Upcoming appointments' })).getByRole('button', {
            name: /Rose checkup/,
          }),
        )
      } else {
        await user.click(screen.getAllByRole('button', { name: /Rose checkup for Rose/ })[0])
      }
      const details = screen.getByRole('dialog', { name: 'Rose checkup' })
      await user.click(within(details).getByRole('button', { name: 'Mark completed' }))
      expect(within(details).getByRole('status')).toHaveTextContent('completed')
      expect(within(details).queryByRole('button', { name: 'Mark completed' })).not.toBeInTheDocument()
      expect(screen.getByText('Total upcoming appointments').parentElement).toHaveTextContent(/0$/)
      expect(screen.getByRole('button', { name: 'No scheduled appointments today.' })).toBeInTheDocument()
      expect(
        within(screen.getByRole('region', { name: 'Upcoming appointments' })).queryByRole('button', {
          name: /Rose checkup/,
        }),
      ).not.toBeInTheDocument()
      const calendar = screen.getByRole('region', { name: 'Calendar' })
      for (const title of within(calendar).getAllByText('Rose checkup', { selector: 'span' })) {
        expect(title).toHaveClass('line-through')
      }
      expect(screen.queryByText('Completed: Rose checkup')).not.toBeInTheDocument()
      await user.click(within(details).getByRole('button', { name: 'Mark as to do' }))
      expect(within(details).getByRole('status')).toHaveTextContent('scheduled')
      expect(screen.getByText('Total upcoming appointments').parentElement).toHaveTextContent(/1$/)
      expect(screen.getByRole('button', { name: /You have 1 scheduled appointment today/ })).toBeInTheDocument()
      expect(
        within(screen.getByRole('region', { name: 'Upcoming appointments' })).getByRole('button', {
          name: /Rose checkup/,
        }),
      ).toBeInTheDocument()
      for (const title of within(calendar).getAllByText('Rose checkup', { selector: 'span' })) {
        expect(title).not.toHaveClass('line-through')
      }
      await user.click(within(details).getByRole('button', { name: 'Mark completed' }))
      fireEvent.click(details, { clientX: -1, clientY: -1 })
      const todayList = screen.queryByRole('dialog', { name: 'Today’s appointments' })
      if (todayList) await user.click(within(todayList).getByRole('button', { name: 'Close' }))
      await user.click(screen.getAllByRole('button', { name: /Rose checkup for Rose,.*completed/ })[0])
      expect(within(screen.getByRole('dialog', { name: 'Rose checkup' })).getByRole('status')).toHaveTextContent(
        'completed',
      )
    },
  )
  it('marks an appointment supplied as completed as to do', async () => {
    const user = userEvent.setup()
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    render(
      <AppointmentsPage
        careProfiles={profiles}
        appointments={[
          {
            ...appointments[0],
            status: 'completed',
            startsAt: start.toISOString(),
            endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
          },
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Rose checkup for Rose,.*completed/ }))
    const details = screen.getByRole('dialog', { name: 'Rose checkup' })
    await user.click(within(details).getByRole('button', { name: 'Mark as to do' }))
    expect(within(details).getByRole('status')).toHaveTextContent('scheduled')
    // Restoring an earlier start today puts it in today's list, but not the future-only upcoming list.
    expect(screen.getByRole('button', { name: /You have 1 scheduled appointment today/ })).toBeInTheDocument()
    expect(screen.getByText('Total upcoming appointments').parentElement).toHaveTextContent(/0$/)
  })
  it('opens details from today’s list and returns to that list when details close', async () => {
    const user = userEvent.setup()
    const start = new Date()
    start.setHours(10, 0, 0, 0)
    render(
      <AppointmentsPage
        careProfiles={profiles}
        appointments={[
          {
            ...appointments[0],
            startsAt: start.toISOString(),
            assignedCaregiver: { id: 'maya', name: 'Maya Alvarez' },
            endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
            location: 'Family clinic',
          },
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /You have 1 scheduled appointment today/ }))
    const todayList = screen.getByRole('dialog', { name: 'Today’s appointments' })
    const entry = within(todayList).getByRole('button', { name: /Rose checkup/ })
    await user.click(entry)
    const details = screen.getByRole('dialog', { name: 'Rose checkup' })
    expect(within(details).getByText('60 minutes')).toBeInTheDocument()
    expect(within(details).getByText('Maya Alvarez')).toBeInTheDocument()
    expect(within(details).getByText('Family clinic')).toBeInTheDocument()
    await user.click(within(details).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Rose checkup' })).not.toBeInTheDocument()
    expect(todayList).toHaveAttribute('open')
    await user.click(entry)
    expect(screen.getByRole('dialog', { name: 'Rose checkup' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('dialog', { name: 'Rose checkup' }), { clientX: -1, clientY: -1 })
    expect(todayList).toHaveAttribute('open')
    fireEvent.click(todayList, { clientX: -1, clientY: -1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('opens appointment details from the upcoming list and can reopen them after closing', async () => {
    const user = userEvent.setup()
    const start = Date.now() + 3_600_000
    render(
      <AppointmentsPage
        careProfiles={profiles}
        appointments={[
          {
            ...appointments[0],
            startsAt: new Date(start).toISOString(),
            endsAt: new Date(start + 5_400_000).toISOString(),
            location: 'Family clinic',
          },
        ]}
      />,
    )
    const upcoming = screen.getByRole('region', { name: 'Upcoming appointments' })
    const entry = within(upcoming).getByRole('button', { name: /Rose checkup/ })
    await user.click(entry)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Rose checkup' })).toBeInTheDocument()
    expect(within(dialog).getByText('90 minutes')).toBeInTheDocument()
    expect(within(dialog).getByText('Unassigned')).toBeInTheDocument()
    expect(within(dialog).getByText('Family clinic')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(entry)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('dialog'), { clientX: -1, clientY: -1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('limits monthly cells to three appointments and opens the full day in a popup', async () => {
    const user = userEvent.setup()
    const busyDay = Array.from({ length: 5 }, (_, index) => ({
      ...appointments[0],
      id: `visit-${index}`,
      title: `Visit ${index + 1}`,
    }))
    render(<AppointmentCalendar profiles={profiles} appointments={busyDay} now={now} />)
    expect(screen.getByText('Visit 3')).toBeInTheDocument()
    expect(screen.queryByText('Visit 4')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Show 2 more appointments/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Visit 5')).toBeInTheDocument()
    // jsdom has zero-sized bounds: (0, 0) is padding, while (-1, -1) is outside.
    fireEvent.click(dialog, { clientX: 0, clientY: 0 })
    expect(dialog).toHaveAttribute('open')
    fireEvent.click(dialog, { clientX: -1, clientY: -1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Show 2 more appointments/ }))
    await user.click(within(dialog).getByRole('button', { name: /Visit 5/ }))
    expect(within(dialog).getByRole('heading', { name: 'Visit 5' })).toBeInTheDocument()
    fireEvent.click(dialog, { clientX: -1, clientY: -1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the full month beyond the seven-day window and follows the selected profiles', () => {
    const view = render(<AppointmentCalendar profiles={profiles} appointments={appointments} now={now} />)
    expect(screen.getByText('Rose checkup')).toBeInTheDocument()
    expect(screen.getByText('Frank checkup')).toBeInTheDocument()
    expect(screen.queryByText('January checkup')).not.toBeInTheDocument()

    view.rerender(<AppointmentCalendar profiles={[profiles[0]]} appointments={appointments} now={now} />)
    expect(screen.getByText('Rose checkup')).toBeInTheDocument()
    expect(screen.queryByText('Frank checkup')).not.toBeInTheDocument()

    view.rerender(<AppointmentCalendar profiles={[]} appointments={appointments} now={now} />)
    expect(screen.queryByText('Rose checkup')).not.toBeInTheDocument()
    expect(screen.getByText('Select a care profile to view appointments.')).toBeInTheDocument()
  })

  it('navigates across the year boundary and back', async () => {
    const user = userEvent.setup()
    render(<AppointmentCalendar profiles={profiles} appointments={appointments} now={now} />)
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('heading', { name: 'January 2027' })).toBeInTheDocument()
    expect(screen.getByText('January checkup')).toBeInTheDocument()
    expect(screen.queryByText('Rose checkup')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByRole('heading', { name: 'December 2026' })).toBeInTheDocument()
  })

  it('places leap day in the correct weekday column', () => {
    render(<AppointmentCalendar profiles={profiles} appointments={[]} now={new Date(2028, 1, 1).getTime()} />)
    const table = screen.getByRole('table', { name: 'February 2028 appointments' })
    const lastRow = within(table).getAllByRole('row').at(-1)!
    const cells = within(lastRow).getAllByRole('cell')
    expect(cells[2]).toHaveTextContent('29')
    expect(within(table).queryByText('30')).not.toBeInTheDocument()
  })

  it('shows a week spanning December and January and advances by one week', async () => {
    const user = userEvent.setup()
    render(<AppointmentCalendar profiles={profiles} appointments={appointments} now={new Date(2027, 0, 1).getTime()} />)
    await user.click(screen.getByRole('button', { name: 'Weekly' }))
    const cells = within(screen.getByRole('table')).getAllByRole('cell')
    expect(cells).toHaveLength(7)
    expect(within(screen.getByRole('table')).getAllByRole('rowheader')).toHaveLength(24)
    expect(within(cells[3]).getByText('Rose checkup').closest('li')).toHaveStyle({ top: '800px', height: '80px' })
    expect(screen.queryByText('January checkup')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(screen.getByText('January checkup')).toBeInTheDocument()
    expect(screen.queryByText('Rose checkup')).not.toBeInTheDocument()
  })

  it('shows one day at a time and advances by one day', async () => {
    const user = userEvent.setup()
    render(
      <AppointmentCalendar profiles={profiles} appointments={appointments} now={new Date(2026, 11, 30).getTime()} />,
    )
    await user.click(screen.getByRole('button', { name: 'Daily' }))
    expect(within(screen.getByRole('table')).getAllByRole('cell')).toHaveLength(1)
    expect(within(screen.getByRole('table')).getAllByRole('rowheader')).toHaveLength(24)
    expect(screen.getByText('Rose checkup').closest('li')).toHaveStyle({ top: '800px', height: '80px' })
    expect(screen.getByText('Frank checkup').closest('li')).toHaveStyle({ top: '880px', height: '80px' })
    expect(screen.getByText('Rose checkup')).toBeInTheDocument()
    expect(screen.getByText('Frank checkup')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next day' }))
    expect(screen.queryByText('Rose checkup')).not.toBeInTheDocument()
    expect(screen.getByText('No appointments this day.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(screen.getByText('Rose checkup')).toBeInTheDocument()
  })
  it('sizes overlapping blocks by duration and shows their end time in the popup', async () => {
    const user = userEvent.setup()
    const overlapping = [
      appointments[0],
      {
        ...appointments[1],
        startsAt: new Date(2026, 11, 30, 10, 30).toISOString(),
        endsAt: new Date(2026, 11, 30, 12).toISOString(),
      },
    ]
    render(
      <AppointmentCalendar profiles={profiles} appointments={overlapping} now={new Date(2026, 11, 30).getTime()} />,
    )
    await user.click(screen.getByRole('button', { name: 'Daily' }))
    expect(screen.getByText('Rose checkup').closest('li')).toHaveStyle({
      top: '800px',
      height: '80px',
      width: '50%',
      left: '0%',
    })
    expect(screen.getByText('Frank checkup').closest('li')).toHaveStyle({
      top: '840px',
      height: '120px',
      width: '50%',
      left: '50%',
    })
    await user.click(screen.getByRole('button', { name: /Frank checkup for Frank/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Ends')).toBeInTheDocument()
    expect(within(dialog).getByText('90 minutes')).toBeInTheDocument()
    expect(dialog.querySelector(`time[datetime="${overlapping[1].endsAt}"]`)).toBeInTheDocument()
  })
})
