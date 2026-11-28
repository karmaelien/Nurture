import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AppointmentCalendar } from './AppointmentCalendar.tsx'
import { AppointmentsPage } from './AppointmentsPage.tsx'
import type { AppointmentSummary, CareProfile } from './AppointmentsPage.tsx'

const profiles: CareProfile[] = [
  { id: 'rose', circleId: 'family', name: 'Rose', circleName: 'Family' },
  { id: 'frank', circleId: 'family', name: 'Frank', circleName: 'Family' },
]
const now = new Date(2026, 11, 15, 12).getTime()

it('uses one profile selector for the appointment list and calendar without a duplicate profile panel', async () => {
  const user = userEvent.setup()
  const startsAt = new Date(Date.now() + 3600000).toISOString()
  const endsAt = new Date(Date.now() + 7200000).toISOString()
  render(
    <AppointmentsPage
      careProfiles={profiles}
      appointments={profiles.map((person) => ({
        id: person.id,
        circleId: person.circleId,
        recipientId: person.id,
        title: `${person.name} visit`,
        startsAt,
        endsAt,
        status: 'scheduled',
      }))}
    />,
  )
  expect(screen.queryByRole('region', { name: 'Care profiles' })).not.toBeInTheDocument()
  expect(screen.queryByRole('list', { name: 'Selected care profiles' })).not.toBeInTheDocument()
  await user.click(screen.getByText('Select care profiles'))
  await user.click(screen.getByRole('checkbox', { name: /Frank/ }))
  const list = screen.getByRole('region', { name: 'Upcoming appointments' })
  expect(within(list).getByText('Rose visit')).toBeInTheDocument()
  expect(within(list).queryByText('Frank visit')).not.toBeInTheDocument()
  expect(screen.getByText(/1 profile selected/)).toBeInTheDocument()
  expect(
    within(screen.getByRole('region', { name: 'Calendar' })).queryByRole('button', { name: /Frank visit for/ }),
  ).not.toBeInTheDocument()
})

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
  it('restores the original day after navigating through a shorter month', async () => {
    const user = userEvent.setup()
    render(<AppointmentCalendar profiles={profiles} appointments={[]} now={new Date(2027, 0, 31, 12).getTime()} />)
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(screen.getByRole('button', { name: 'Daily' }))
    expect(screen.getByRole('heading', { name: /March 31, 2027/ })).toBeInTheDocument()
  })
  it('labels overdue calendar blocks in month, week, and day views', async () => {
    const user = userEvent.setup()
    render(
      <AppointmentCalendar
        profiles={profiles}
        appointments={[appointments[0]]}
        now={new Date(2026, 11, 30, 12).getTime()}
      />,
    )
    expect(screen.getByRole('button', { name: /Rose checkup.*overdue/ })).toBeInTheDocument()
    for (const view of ['Weekly', 'Daily']) {
      await user.click(screen.getByRole('button', { name: view }))
      expect(screen.getByRole('button', { name: /Rose checkup.*overdue/ })).toBeInTheDocument()
    }
  })
  it('warns about ended scheduled visits and clears the warning when they are completed', async () => {
    const user = userEvent.setup()
    const time = Date.now()
    const ended = {
      ...appointments[0],
      startsAt: new Date(time - 7_200_000).toISOString(),
      endsAt: new Date(time - 3_600_000).toISOString(),
    }
    render(
      <AppointmentsPage
        careProfiles={profiles}
        appointments={[
          ended,
          { ...ended, id: 'done', title: 'Completed visit', status: 'completed' },
          { ...ended, id: 'ongoing', title: 'Ongoing visit', endsAt: new Date(time + 3_600_000).toISOString() },
          { ...ended, id: 'missing-end', title: 'Start only', endsAt: undefined },
        ]}
      />,
    )

    const warning = screen.getByRole('button', { name: '1 overdue appointment' })
    const notices = within(screen.getByRole('region', { name: 'Attention Needed' })).getAllByRole('button')
    expect(notices[0]).toBe(warning)
    expect(notices[1]).toHaveAccessibleName(/scheduled appointments today/)
    const upcoming = screen.getByRole('region', { name: 'Upcoming appointments' })
    expect(within(upcoming).getByText('Overdue')).toBeInTheDocument()
    await user.click(warning)
    const dialog = screen.getByRole('dialog', { name: 'Overdue appointments' })
    expect(within(dialog).getByText('Rose checkup')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1)
    await user.click(within(dialog).getByRole('button', { name: 'Mark completed' }))
    expect(within(dialog).getByText('No overdue appointments.')).toBeInTheDocument()
    fireEvent.click(dialog, { clientX: -1, clientY: -1 })
    expect(screen.queryByRole('dialog', { name: 'Overdue appointments' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '0 overdue appointments' })).toBeInTheDocument()
  })
  it.each(['today', 'upcoming', 'calendar'] as const)(
    'completes directly from %s and restores through the calendar',
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
      let scope: HTMLElement
      if (source === 'today') {
        await user.click(screen.getByRole('button', { name: /You have 1 scheduled appointment today/ }))
        scope = screen.getByRole('dialog', { name: 'Today’s appointments' })
      } else if (source === 'upcoming') {
        scope = screen.getByRole('region', { name: 'Upcoming appointments' })
      } else {
        await user.click(screen.getAllByRole('button', { name: /Rose checkup for Rose/ })[0])
        scope = screen.getByRole('dialog', { name: 'Rose checkup' })
      }
      await user.click(within(scope).getByRole('button', { name: 'Mark completed' }))
      expect(
        within(screen.getByRole('region', { name: 'Upcoming appointments' })).getByRole('status'),
      ).toHaveTextContent('0 upcoming appointments')
      expect(screen.getByRole('button', { name: 'No scheduled appointments today.' })).toBeInTheDocument()
      const upcomingList = screen.getByRole('region', { name: 'Upcoming appointments' })
      expect(within(upcomingList).getByText('Rose checkup')).toBeInTheDocument()
      expect(within(upcomingList).getByRole('img', { name: 'Completed' })).toBeInTheDocument()
      expect(within(upcomingList).getByRole('button', { name: 'Mark as to do' })).toBeInTheDocument()
      const calendar = screen.getByRole('region', { name: 'Calendar' })
      for (const title of within(calendar).getAllByText('Rose checkup', { selector: 'span' }))
        expect(title).toHaveClass('line-through')
      if (source !== 'upcoming') {
        fireEvent.click(scope, { clientX: -1, clientY: -1 })
      }
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await user.click(screen.getAllByRole('button', { name: /Rose checkup for Rose,.*completed/ })[0])
      const details = screen.getByRole('dialog', { name: 'Rose checkup' })
      await user.click(within(details).getByRole('button', { name: 'Mark as to do' }))
      expect(within(details).getByRole('status')).toHaveTextContent('scheduled')
      expect(
        within(screen.getByRole('region', { name: 'Upcoming appointments' })).getByRole('status'),
      ).toHaveTextContent('1 upcoming appointment')
      for (const title of within(calendar).getAllByText('Rose checkup', { selector: 'span' }))
        expect(title).not.toHaveClass('line-through')
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
    expect(within(screen.getByRole('region', { name: 'Upcoming appointments' })).getByRole('status')).toHaveTextContent(
      '0 upcoming appointments',
    )
  })
  it('shows today’s cards with map links and direct actions without another popup', async () => {
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
            endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
            assignedCaregiver: { id: 'maya', name: 'Maya Alvarez' },
            location: 'Family clinic',
          },
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /You have 1 scheduled appointment today/ }))
    const list = screen.getByRole('dialog', { name: 'Today’s appointments' })
    expect(within(list).getByText('Maya Alvarez')).toBeInTheDocument()
    const map = within(list).getByRole('link', { name: 'Location: Family clinic' })
    expect(map).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=Family%20clinic')
    expect(map).toHaveAttribute('target', '_blank')
    await user.click(within(list).getByText('Rose checkup'))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.click(within(list).getByRole('button', { name: 'Mark completed' }))
    expect(within(list).getByText('Rose checkup')).toBeInTheDocument()
    expect(within(list).getByRole('img', { name: 'Completed' })).toBeInTheDocument()
    await user.click(within(list).getByRole('button', { name: 'Mark as to do' }))
    expect(within(list).getByRole('button', { name: 'Mark completed' })).toBeInTheDocument()
    fireEvent.click(list, { clientX: -1, clientY: -1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('completes upcoming cards inline and keeps missing locations as plain text', async () => {
    const user = userEvent.setup()
    const start = Date.now() + 3_600_000
    render(
      <AppointmentsPage
        careProfiles={profiles}
        appointments={[
          {
            ...appointments[0],
            startsAt: new Date(start).toISOString(),
            endsAt: new Date(start + 3_600_000).toISOString(),
          },
        ]}
      />,
    )
    const upcoming = screen.getByRole('region', { name: 'Upcoming appointments' })
    expect(within(upcoming).getByText('Location not provided')).toBeInTheDocument()
    expect(within(upcoming).queryByRole('link')).not.toBeInTheDocument()
    await user.click(within(upcoming).getByText('Rose checkup'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(within(upcoming).getByRole('button', { name: 'Mark completed' }))
    expect(within(upcoming).getByText('Rose checkup')).toBeInTheDocument()
    expect(within(upcoming).getByRole('img', { name: 'Completed' })).toBeInTheDocument()
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
    await user.click(within(dialog).getByText('Visit 5'))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(within(dialog).queryByRole('button', { name: /Visit 5/ })).not.toBeInTheDocument()
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
